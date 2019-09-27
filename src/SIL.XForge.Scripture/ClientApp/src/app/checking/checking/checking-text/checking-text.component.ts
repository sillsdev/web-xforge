import { Component, EventEmitter, Input, Output, ViewChild, ViewEncapsulation } from '@angular/core';
import { clone } from 'lodash';
import isEqual from 'lodash/isEqual';
import { fromVerseRef, toVerseRef, VerseRefData } from 'realtime-server/lib/scriptureforge/models/verse-ref-data';
import { VerseRef } from 'realtime-server/lib/scriptureforge/scripture-utils/verse-ref';
import { fromEvent, Subscription } from 'rxjs';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { TextDocId } from '../../../core/models/text-doc';
import { TextComponent } from '../../../shared/text/text.component';

@Component({
  selector: 'app-checking-text',
  templateUrl: './checking-text.component.html',
  styleUrls: ['./checking-text.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class CheckingTextComponent extends SubscriptionDisposable {
  @ViewChild(TextComponent, { static: true }) textComponent: TextComponent;

  @Input() set activeVerse(verseRef: Readonly<VerseRef>) {
    if (this.activeVerse) {
      // Removed the highlight on the old active verse
      this.highlightActiveVerse(this.activeVerse, false);
    }
    if (verseRef != null && this.isEditorLoaded) {
      this.highlightActiveVerse(verseRef, true);
    }
    this._activeVerse = verseRef;
  }
  @Input() set id(textDocId: TextDocId) {
    if (textDocId) {
      if (this.isEditorLoaded && !isEqual(this._id, textDocId)) {
        this._editorLoaded = false;
      }
      this._id = textDocId;
    }
  }
  @Output() verseClicked: EventEmitter<VerseRef> = new EventEmitter<VerseRef>();
  @Input() mode: 'checking' | 'dialog' = 'checking';

  private clickSubs: Subscription[] = [];
  private _activeVerse: Readonly<VerseRef>;
  private _editorLoaded = false;
  private _id: TextDocId;
  private _verses: Readonly<VerseRef[]>;

  get activeVerse(): Readonly<VerseRef> {
    return this._activeVerse;
  }

  get isEditorLoaded(): boolean {
    return this._editorLoaded;
  }

  get id() {
    return this._id;
  }

  @Input() set verses(verseRefs: Readonly<VerseRef[]>) {
    if (this.isEditorLoaded) {
      this.resetVerseHighlights(verseRefs);
    }
    this._verses = clone(verseRefs);
    if (this.isEditorLoaded) {
      this.highlightVerses();
    }
  }

  get verses(): Readonly<VerseRef[]> {
    return this._verses;
  }

  applyFontChange(fontSize: string) {
    this.textComponent.editorStyles = {
      fontSize: fontSize
    };
  }

  highlightVerses() {
    this._editorLoaded = true;
    if (this.mode === 'checking') {
      if (this.verses) {
        const segments: string[] = [];
        for (const verse of this.verses) {
          const referenceSegments = this.getVerseSegments(verse);
          if (referenceSegments.length) {
            this.setupQuestionSegments([referenceSegments[0]], true);
            for (const segment of referenceSegments) {
              if (!segments.includes(segment)) {
                segments.push(segment);
              }
            }
          }
        }
        this.highlightSegments(segments);
        if (this.activeVerse) {
          this.selectActiveVerse(this.activeVerse, true);
        }
      }
    } else {
      // In dialog mode, highlight the active verse without putting the ? marker before the text
      this.highlightActiveVerse(this._activeVerse, true);
    }
  }

  highlightActiveVerse(verseRef: Readonly<VerseRef>, toggle: boolean) {
    if (this.mode === 'dialog') {
      const segments = this.getVerseSegments(verseRef);
      this.highlightSegments(segments, toggle);
    }
    this.selectActiveVerse(verseRef, toggle);
  }

  private getVerseSegments(verseRef: Readonly<VerseRef>): string[] {
    const segments: string[] = [];
    let segment = '';
    for (const verseInRange of verseRef.allVerses()) {
      segment = this.getSegment(verseInRange.chapterNum, verseInRange.verseNum);
      if (!segments.includes(segment)) {
        segments.push(segment);
      }
    }
    return segments;
  }

  private getSegment(chapter: number, verse: number) {
    return 'verse_' + chapter + '_' + verse;
  }

  private highlightSegments(segments: string[], toggle = true) {
    for (const segment of segments) {
      if (!this.textComponent.hasSegmentRange(segment)) {
        continue;
      }
      const range = this.textComponent.getSegmentRange(segment);
      this.textComponent.toggleHighlight(toggle, range);
      if (this.mode === 'dialog') {
        continue;
      }
      if (!toggle) {
        continue;
      }
      const element = this.textComponent.editor.container.querySelector('usx-segment[data-segment=' + segment + ']');
      this.clickSubs.push(
        this.subscribe(fromEvent(element, 'click'), (event: MouseEvent) => {
          let target = event.target;
          if (target['offsetParent']['nodeName'] === 'USX-SEGMENT') {
            target = target['offsetParent'];
          }
          if (target['nodeName'] === 'USX-SEGMENT') {
            const clickSegment = target['attributes']['data-segment'].value;
            const segmentParts = clickSegment.split('_', 3);
            const verseRef = new VerseRef(this._id.bookNum, segmentParts[1], segmentParts[2]);
            const verseRefData = fromVerseRef(verseRef);
            this.segmentClicked(verseRefData);
          }
        })
      );
    }
  }

  private resetVerseHighlights(verseRefs: Readonly<VerseRef[]>) {
    // Remove all highlights and question segments
    for (const verseRef of this.verses) {
      if (!verseRefs.includes(verseRef)) {
        const segment = this.getSegment(verseRef.chapterNum, verseRef.verseNum);
        if (!this.textComponent.hasSegmentRange(segment)) {
          continue;
        }
        const range = this.textComponent.getSegmentRange(segment);
        this.textComponent.toggleHighlight(false, range);
        this.setupQuestionSegments([segment], false);
      }
    }
    // Un-subscribe from all segment click events as these all get setup again
    for (const event of this.clickSubs) {
      event.unsubscribe();
    }
  }

  private segmentClicked(verseRefData: VerseRefData) {
    this.verseClicked.emit(toVerseRef(verseRefData));
  }

  private setupQuestionSegments(segments: string[], toggle: boolean) {
    for (const segment of segments) {
      if (!this.textComponent.hasSegmentRange(segment)) {
        continue;
      }
      const range = this.textComponent.getSegmentRange(segment);
      Promise.resolve().then(() => {
        this.textComponent.editor.formatText(
          range.index,
          range.length,
          'data-question',
          toggle ? 'true' : false,
          'silent'
        );
      });
    }
  }

  private selectActiveVerse(verseRef: Readonly<VerseRef>, toggle: boolean) {
    for (const segment of this.getVerseSegments(verseRef)) {
      if (!this.textComponent.hasSegmentRange(segment)) {
        continue;
      }
      const range = this.textComponent.getSegmentRange(segment);
      Promise.resolve().then(() => {
        this.textComponent.editor.formatText(
          range.index,
          range.length,
          'data-selected',
          toggle ? 'true' : false,
          'silent'
        );
      });
    }
  }
}
