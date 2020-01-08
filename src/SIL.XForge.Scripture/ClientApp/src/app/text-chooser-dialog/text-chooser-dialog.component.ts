import { MDC_DIALOG_DATA, MdcDialog, MdcDialogConfig, MdcDialogRef } from '@angular-mdc/web';
import { Component, ElementRef, Inject, Optional, ViewChild } from '@angular/core';
import { toVerseRef, VerseRefData } from 'realtime-server/lib/scriptureforge/models/verse-ref-data';
import { VerseRef } from 'realtime-server/lib/scriptureforge/scripture-utils/verse-ref';
import { fromEvent } from 'rxjs';
import { throttleTime } from 'rxjs/operators';
import { DOCUMENT } from 'xforge-common/browser-globals';
import { I18nService } from 'xforge-common/i18n.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { TextDocId } from '../core/models/text-doc';
import { TextsByBookId } from '../core/models/texts-by-book-id';
import {
  ScriptureChooserDialogComponent,
  ScriptureChooserDialogData
} from '../scripture-chooser-dialog/scripture-chooser-dialog.component';
import { TextComponent } from '../shared/text/text.component';

export interface TextChooserDialogData {
  bookNum: number;
  chapterNum: number;
  projectId: string;
  textsByBookId: TextsByBookId;
  selectedText?: string;
  selectedVerses?: VerseRefData;
}

export interface TextSelection {
  verses: VerseRefData;
  text: string;
  // whether or not the starting verse was fully selected (useful for knowing whether to show e.g. an ellipsis)
  startClipped: boolean;
  endClipped: boolean;
}

@Component({
  templateUrl: './text-chooser-dialog.component.html',
  styleUrls: ['./text-chooser-dialog.component.scss']
})
export class TextChooserDialogComponent extends SubscriptionDisposable {
  @ViewChild(TextComponent, { static: true }) textComponent?: TextComponent;
  @ViewChild(TextComponent, { static: false, read: ElementRef }) scriptureText!: ElementRef;
  selectedText?: string;
  showError = false;
  bookNum: number;
  chapterNum: number;
  textDocId: TextDocId;

  private rawTextSelection = '';
  private selectedVerses?: VerseRefData;
  private selectionChanged = false;
  private startClipped = false;
  private endClipped = false;

  constructor(
    private readonly dialogRef: MdcDialogRef<TextChooserDialogComponent>,
    readonly dialog: MdcDialog,
    private readonly i18n: I18nService,
    @Inject(DOCUMENT) private readonly document: Document,
    @Optional() @Inject(MDC_DIALOG_DATA) private readonly data: TextChooserDialogData
  ) {
    super();
    // caniuse doesn't have complete data for the selection events api, but testing on BrowserStack shows the event is
    // fired at least as far back as iOS v7 on Safari 7.
    // Edge 42 with EdgeHTML 17 also fires the events.
    // Firefox and Chrome also support it. We can degrade gracefully by getting the selection when the dialog closes.
    this.subscribe(fromEvent(this.document, 'selectionchange').pipe(throttleTime(100)), () => this.updateSelection());

    this.bookNum = this.data.bookNum;
    this.chapterNum = this.data.chapterNum;
    this.selectedText = this.data.selectedText;
    this.selectedVerses = this.data.selectedVerses;

    this.textDocId = new TextDocId(this.data.projectId, this.bookNum, this.chapterNum);
  }

  get bookName(): string {
    return this.i18n.translateBook(this.bookNum);
  }

  updateSelection() {
    const selection = this.document.getSelection();
    const rawSelection = (selection || '').toString();
    if (selection != null && rawSelection.trim() !== '' && rawSelection !== this.rawTextSelection) {
      // all non-empty verse elements in the selection
      const segments = Array.from(this.getSegments()).filter(segment => selection.containsNode(segment, true));

      if (segments.filter(segment => segment.querySelector('usx-blank') == null).length === 0) {
        return;
      }

      const expansion = this.expandSelection(selection, segments);
      if (expansion.result === '') {
        return;
      }
      this.selectedText = expansion.result;
      this.startClipped = expansion.startClipped;
      this.endClipped = expansion.endClipped;
      const firstVerseNum = expansion.firstVerseNum;
      const lastVerseNum = expansion.lastVerseNum;

      this.selectedVerses = {
        bookNum: this.bookNum,
        chapterNum: this.chapterNum,
        verseNum: firstVerseNum,
        verse: firstVerseNum === lastVerseNum ? firstVerseNum.toString() : firstVerseNum + '-' + lastVerseNum
      };
      this.rawTextSelection = rawSelection;
      this.selectionChanged = true;
      this.showError = false;
    }
  }

  openScriptureChooser() {
    const dialogConfig: MdcDialogConfig<ScriptureChooserDialogData> = {
      data: { booksAndChaptersToShow: this.data.textsByBookId, includeVerseSelection: false }
    };

    const dialogRef = this.dialog.open(ScriptureChooserDialogComponent, dialogConfig) as MdcDialogRef<
      ScriptureChooserDialogComponent,
      VerseRef | 'close'
    >;
    dialogRef.afterClosed().subscribe(result => {
      if (result != null && result !== 'close') {
        this.bookNum = result.bookNum;
        this.chapterNum = result.chapterNum;
        this.textDocId = new TextDocId(this.data.projectId, this.bookNum, this.chapterNum);
      }
    });
  }

  get referenceForDisplay() {
    return this.selectedVerses ? `(${this.i18n.translateReference(toVerseRef(this.selectedVerses))})` : '';
  }

  submit() {
    this.updateSelection();
    if (this.selectedVerses != null) {
      if (this.selectionChanged) {
        const selection: TextSelection = {
          verses: this.selectedVerses,
          text: this.selectedText!,
          startClipped: this.startClipped,
          endClipped: this.endClipped
        };
        this.dialogRef.close(selection);
      } else {
        this.dialogRef.close('close');
      }
    } else {
      this.showError = true;
    }
  }

  /**
   * Given the user's selection and the USX segment dom elements that are part of the selection:
   * - Expands the selection to the nearest word boundaries
   * - Determines whether the start and end verses were clipped, so that e.g. ellipses can be displayed at the start
   *   and/or end the selection. If only white space was clipped it is not counted as being clipped.
   * - Normalizes whitespace between segments to a single space.
   */
  private expandSelection(selection: Selection, segments: Element[]) {
    // all selected verses except the first and last
    const centralSelection = segments
      .filter((_el, index) => index !== 0 && index !== segments.length - 1)
      .map(el => (el.textContent || '').trim())
      .join(' ');

    const startRange = selection.getRangeAt(0);
    const endRange = selection.getRangeAt(selection.rangeCount - 1);
    const startOffset = this.isInASegment(startRange.startContainer) ? startRange.startOffset : 0;
    const endOffset = this.isInASegment(endRange.endContainer)
      ? endRange.endOffset
      : segments[segments.length - 1].textContent!.length;
    const startNodeText = segments[0].textContent!;
    const endNodeText = segments[segments.length - 1].textContent!;
    const startText = startNodeText.substring(startOffset);
    const endText = endNodeText.substring(0, endOffset);

    let startTrimLength = startText.length - startText.trimLeft().length;
    if (startTrimLength === 0 && startText !== '') {
      // [\s\S] matches ANY character including \n, unlike .
      // \u200B is zero width space
      // Find the last word boundary that isn't the end of the string. This works because * is greedy.
      startTrimLength =
        /[\s\S]*(?:\u200B|\b|\s|^)(?=[\s\S])/.exec(startNodeText.substring(0, startOffset + 1))![0].length -
        startOffset;
    }
    let endTrimLength = endText.length - endText.trimRight().length;
    if (endTrimLength === 0 && endText !== '') {
      endTrimLength = -Math.max(0, endNodeText.substring(endOffset - 1).search(/[\s\S](?:\u200B|\b|\s|$)/));
    }

    let result = [startNodeText, centralSelection, segments.length === 1 ? '' : endNodeText].filter(s => s).join(' ');
    result = result
      .substring(startOffset + startTrimLength, result.length - endNodeText.length + endOffset - endTrimLength)
      .trim();

    const startSegmentClipped = startOffset + startTrimLength > startNodeText.length - startNodeText.trimLeft().length;
    const endSegmentClipped = endOffset + endTrimLength < endNodeText.trimRight().length;

    const firstVerseSegments = Array.from(this.getSegments(this.getVerseFromElement(segments[0]))).filter(
      el => (el.textContent || '').trim() !== ''
    );
    const lastVerseSegments = Array.from(
      this.getSegments(this.getVerseFromElement(segments[segments.length - 1]))
    ).filter(el => (el.textContent || '').trim() !== '');

    const startClipped =
      (startSegmentClipped && startText.trim() !== '') ||
      (firstVerseSegments.length !== 0 && !firstVerseSegments[0].contains(segments[0]));
    const endClipped =
      (endSegmentClipped && endText.trim() !== '') ||
      (lastVerseSegments.length !== 0 &&
        !lastVerseSegments[lastVerseSegments.length - 1].contains(segments[segments.length - 1]));

    const firstVerseNum =
      startText.trim() === '' && segments.length > 1
        ? this.getVerseFromElement(segments[1])
        : this.getVerseFromElement(segments[0]);
    const lastVerseNum =
      endText.trim() === '' && segments.length > 1
        ? this.getVerseFromElement(segments[segments.length - 2])
        : this.getVerseFromElement(segments[segments.length - 1]);

    return {
      startClipped,
      endClipped,
      firstVerseNum,
      lastVerseNum,
      result
    };
  }

  private getVerseFromElement(element: Element): number {
    return parseInt(element.getAttribute('data-segment')!.split('_', 3)[2], 10);
  }

  private getSegments(verse?: number) {
    return this.segments().filter(el => (verse == null ? true : verse === this.getVerseFromElement(el)));
  }

  private isInASegment(node: Node) {
    return this.segments().some(segment => segment.contains(node));
  }

  private segments() {
    return Array.from(
      (this.scriptureText.nativeElement as HTMLElement).querySelectorAll('usx-segment[data-segment^=verse_]')
    );
  }
}
