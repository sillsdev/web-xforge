import { Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { translate } from '@ngneat/transloco';
import { Canon, VerseRef } from '@sillsdev/scripture';
import clone from 'lodash-es/clone';
import isEqual from 'lodash-es/isEqual';
import { fromEvent, Subscription } from 'rxjs';
import { FontService } from 'xforge-common/font.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { TextDocId } from '../../../core/models/text-doc';
import { TextComponent } from '../../../shared/text/text.component';
import { getVerseStrFromSegmentRef, verseRefFromMouseEvent } from '../../../shared/utils';

@Component({
  selector: 'app-checking-text',
  templateUrl: './checking-text.component.html',
  styleUrls: ['./checking-text.component.scss']
})
export class CheckingTextComponent extends SubscriptionDisposable {
  @ViewChild(TextComponent, { static: true }) textComponent!: TextComponent;
  @Output() questionVerseSelected = new EventEmitter<VerseRef>();
  @Input() isRightToLeft: boolean = false;
  @Input() fontSize?: string;
  @Input() projectDoc?: SFProjectProfileDoc;

  private clickSubs: Subscription[] = [];
  private _activeVerse?: VerseRef;
  private _editorLoaded = false;
  private _id?: TextDocId;
  private _questionVerses?: VerseRef[];
  private _placeholder?: string;

  constructor(readonly fontService: FontService) {
    super();
  }

  @Input() set placeholder(value: string) {
    this._placeholder = value;
  }

  get placeholder(): string {
    return this._placeholder || translate('text.loading');
  }

  @Input() set activeVerse(verseRef: VerseRef | undefined) {
    if (this._activeVerse?.toString() === verseRef?.toString()) {
      return;
    }
    this._activeVerse = verseRef;
    this.highlightActiveVerse();
    this.scrollToVerse(this.activeVerse);
  }

  get activeVerse(): VerseRef | undefined {
    return this._activeVerse;
  }

  get isEditorLoaded(): boolean {
    return this._editorLoaded;
  }

  @Input() set id(textDocId: TextDocId | undefined) {
    if (textDocId) {
      if (this.isEditorLoaded && !isEqual(this._id, textDocId)) {
        this._editorLoaded = false;
      }
      if (this._activeVerse != null && this._id != null && !isEqual(this._id, textDocId)) {
        this.activeVerse = undefined;
      }
      this._id = textDocId;
    }
  }

  get id(): TextDocId | undefined {
    return this._id;
  }

  @Input() set questionVerses(verseRefs: VerseRef[] | undefined) {
    this.toggleQuestionVerses(false);
    this._questionVerses = clone(verseRefs);
    this.toggleQuestionVerses(true);
  }

  get questionVerses(): VerseRef[] | undefined {
    return this._questionVerses;
  }

  onLoaded(): void {
    this._editorLoaded = true;
    this.toggleQuestionVerses(true);
    this.highlightActiveVerse();
    this.scrollToVerse(this.activeVerse);
  }

  setAudioTextRef(reference: string): void {
    this.highlightSegments(reference);
  }

  private get questionVersesInCurrentText(): VerseRef[] {
    if (this.questionVerses == null) {
      return [];
    }
    return this.questionVerses.filter(v => v.bookNum === this.id?.bookNum && v.chapterNum === this.id?.chapterNum);
  }

  private toggleQuestionVerses(value: boolean): void {
    if (!this.isEditorLoaded || this.questionVerses == null) {
      return;
    }
    const segments: string[] = this.textComponent.toggleFeaturedVerseRefs(
      value,
      this.questionVersesInCurrentText,
      'question'
    );
    if (value) {
      this.subscribeClickEvents(segments);
    } else {
      // Un-subscribe from all segment click events as these all get setup again
      for (const event of this.clickSubs) {
        event.unsubscribe();
      }
    }
  }

  private highlightActiveVerse(): void {
    if (!this.isEditorLoaded) {
      return;
    }

    const refs: string[] =
      this._activeVerse != null ? this.textComponent.getVerseSegmentsNoHeadings(this._activeVerse) : [];
    this.textComponent.highlight(refs);
  }

  /**
   * Highlight segments based off of a base verse reference. If the reference is verse_1_3, this will
   * highlight verse_1_3, verse_1_3/p1, verse_1_3/p2, etc.
   */
  private highlightSegments(baseRef: string): void {
    if (!this.isEditorLoaded || this.id == null) {
      return;
    }

    let refs: string[] = [];
    const verseStr: string | undefined = getVerseStrFromSegmentRef(baseRef);
    if (verseStr != null) {
      const verseRef: VerseRef = new VerseRef(
        Canon.bookNumberToId(this.id.bookNum),
        this.id.chapterNum.toString(),
        verseStr
      );
      this.scrollToVerse(verseRef);
      refs = this.textComponent.getVerseSegmentsNoHeadings(verseRef);
    } else {
      refs.push(baseRef);
    }
    this.textComponent.highlight(refs);
  }

  private subscribeClickEvents(segments: string[]): void {
    for (const segment of segments) {
      const element: Element | null = this.textComponent.getSegmentElement(segment);
      if (element == null) {
        continue;
      }
      this.clickSubs.push(
        this.subscribe(fromEvent<MouseEvent>(element, 'click'), event => {
          if (this._id == null) {
            return;
          }
          const verseRef: VerseRef | undefined = verseRefFromMouseEvent(event, this._id.bookNum);
          if (verseRef != null) {
            this.questionVerseSelected.emit(verseRef);
          }
        })
      );
    }
  }

  private scrollToVerse(verseRef: VerseRef | undefined): void {
    if (verseRef != null && this.textComponent.editor != null) {
      const firstSegment: string = this.textComponent.getVerseSegments(verseRef)[0];
      const editor: Element | null = this.textComponent.editor.container.querySelector('.ql-editor');
      if (editor != null) {
        const element: HTMLElement = this.textComponent.getSegmentElement(firstSegment) as HTMLElement;
        if (element != null) {
          editor.scrollTo({ top: element.offsetTop - 20, behavior: 'smooth' });
        }
      }
    }
  }
}
