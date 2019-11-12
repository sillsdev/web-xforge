import { Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import clone from 'lodash/clone';
import isEqual from 'lodash/isEqual';
import { fromVerseRef, toVerseRef, VerseRefData } from 'realtime-server/lib/scriptureforge/models/verse-ref-data';
import { VerseRef } from 'realtime-server/lib/scriptureforge/scripture-utils/verse-ref';
import { fromEvent, Subscription } from 'rxjs';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { verseSlug } from 'xforge-common/utils';
import { TextDocId } from '../../../core/models/text-doc';
import { TextComponent } from '../../../shared/text/text.component';

@Component({
  selector: 'app-checking-text',
  templateUrl: './checking-text.component.html',
  styleUrls: ['./checking-text.component.scss']
})
export class CheckingTextComponent extends SubscriptionDisposable {
  @Input() placeholder = 'Loading...';
  @ViewChild(TextComponent, { static: true }) textComponent!: TextComponent;
  @Output() questionVerseSelected = new EventEmitter<VerseRef>();

  private clickSubs: Subscription[] = [];
  private _activeVerse?: Readonly<VerseRef>;
  private _editorLoaded = false;
  private _id?: TextDocId;
  private _questionVerses?: Readonly<VerseRef[]>;

  @Input() set activeVerse(verseRef: Readonly<VerseRef> | undefined) {
    // Removed the highlight on the old active verse
    this.highlightActiveVerse(false);
    this._activeVerse = verseRef;
    this.highlightActiveVerse(true);
  }

  get activeVerse(): Readonly<VerseRef> | undefined {
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
      this._id = textDocId;
    }
  }

  get id(): TextDocId | undefined {
    return this._id;
  }

  @Input() set questionVerses(verseRefs: Readonly<VerseRef[]> | undefined) {
    this.toggleQuestionVerses(false);
    this._questionVerses = clone(verseRefs);
    this.toggleQuestionVerses(true);
  }

  get questionVerses(): Readonly<VerseRef[]> | undefined {
    return this._questionVerses;
  }

  applyFontChange(fontSize: string): void {
    this.textComponent.editorStyles = {
      fontSize: fontSize
    };
  }

  onLoaded(): void {
    this._editorLoaded = true;
    this.toggleQuestionVerses(true);
    this.highlightActiveVerse(true);
  }

  private toggleQuestionVerses(value: boolean): void {
    if (!this.isEditorLoaded || this.questionVerses == null) {
      return;
    }

    const segments: string[] = [];
    const questionCounts = new Map<string, number>();
    for (const verse of this.questionVerses) {
      const referenceSegments = this.getVerseSegments(verse);
      if (referenceSegments.length > 0) {
        const count = questionCounts.get(referenceSegments[0]);
        if (count != null) {
          questionCounts.set(referenceSegments[0], count + 1);
        } else {
          questionCounts.set(referenceSegments[0], 1);
        }

        for (const segment of referenceSegments) {
          if (!segments.includes(segment)) {
            segments.push(segment);
          }
        }
      }
    }
    this.toggleQuestionSegments(questionCounts, segments, value);
  }

  private highlightActiveVerse(toggle: boolean): void {
    if (!this.isEditorLoaded || this._activeVerse == null) {
      return;
    }

    for (const segment of this.getVerseSegments(this._activeVerse)) {
      const range = this.textComponent.getSegmentRange(segment);
      if (range == null) {
        continue;
      }
      this.textComponent.toggleHighlight(toggle, range);
    }
  }

  private getVerseSegments(verseRef: Readonly<VerseRef>): string[] {
    const segments: string[] = [];
    let segment = '';
    for (const verseInRange of verseRef.allVerses()) {
      segment = verseSlug(verseInRange);
      if (!segments.includes(segment)) {
        segments.push(segment);
      }
      // Check for related segments like this verse i.e. verse_1_2/q1
      for (const relatedSegment of this.textComponent.getRelatedSegmentRefs(segment)) {
        const text = this.textComponent.getSegmentText(relatedSegment);
        if (text !== '' && !segments.includes(relatedSegment)) {
          segments.push(relatedSegment);
        }
      }
    }
    return segments;
  }

  private toggleQuestionSegments(questionCounts: Map<string, number>, segments: string[], value: boolean): void {
    if (this.textComponent.editor == null) {
      return;
    }

    for (const segment of segments) {
      const range = this.textComponent.getSegmentRange(segment);
      if (range == null) {
        continue;
      }
      const element = this.textComponent.editor.container.querySelector('usx-segment[data-segment="' + segment + '"]');
      if (element == null) {
        continue;
      }
      const formats: any = {
        'question-segment': value
      };
      const count = questionCounts.get(segment);
      if (count != null) {
        formats['question-count'] = value ? count : false;
      }
      this.textComponent.editor.formatText(range.index, range.length, formats, 'silent');
      if (value) {
        this.clickSubs.push(
          this.subscribe(fromEvent<MouseEvent>(element, 'click'), event => {
            if (this._id == null || event.target == null) {
              return;
            }
            let target = event.target;
            if (target['offsetParent']['nodeName'] === 'USX-SEGMENT') {
              target = target['offsetParent'] as EventTarget;
            }
            if (target['nodeName'] === 'USX-SEGMENT') {
              const clickSegment = target['attributes']['data-segment'].value;
              const segmentParts = clickSegment.split('_', 3);
              const verseRef = new VerseRef(this._id.bookNum, segmentParts[1], segmentParts[2]);
              this.questionVerseSelected.emit(verseRef);
            }
          })
        );
      } else {
        // Un-subscribe from all segment click events as these all get setup again
        for (const event of this.clickSubs) {
          event.unsubscribe();
        }
      }
    }
  }
}
