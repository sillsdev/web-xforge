import { Component, EventEmitter, Input, Output, ViewChild, ViewEncapsulation } from '@angular/core';
import isEqual from 'lodash/isEqual';
import { VerseRefData } from 'realtime-server/lib/scriptureforge/models/verse-ref-data';
import { fromEvent } from 'rxjs';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { TextDocId } from '../../../core/models/text-doc-id';
import { verseRefDataToVerseRef } from '../../../shared/scripture-utils/verse-ref-data-converters';
import { TextComponent } from '../../../shared/text/text.component';

// An interface for objects with scripture reference properties i.e. Questions
export interface ScriptureReference {
  scriptureStart?: VerseRefData;
  scriptureEnd?: VerseRefData;
}

@Component({
  selector: 'app-checking-text',
  templateUrl: './checking-text.component.html',
  styleUrls: ['./checking-text.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class CheckingTextComponent extends SubscriptionDisposable {
  @ViewChild(TextComponent, { static: true }) textComponent: TextComponent;

  @Input() set activeReference(reference: Readonly<ScriptureReference>) {
    if (this.activeReference && this.isEditorLoaded) {
      // Removed the highlight on the old active reference
      this.highlightActiveReference(this.activeReference, false);
      if (reference != null) {
        this.highlightActiveReference(reference, true);
      }
    }
    this._activeReference = reference;
  }
  @Input() set id(textDocId: TextDocId) {
    if (textDocId) {
      if (this.isEditorLoaded && !isEqual(this._id, textDocId)) {
        this._editorLoaded = false;
      }
      this._id = textDocId;
    }
  }
  @Output() referenceClicked: EventEmitter<ScriptureReference> = new EventEmitter<ScriptureReference>();
  @Input() references: Readonly<ScriptureReference[]> = [];
  @Input() mode: 'checking' | 'dialog' = 'checking';

  private _activeReference: Readonly<ScriptureReference>;
  private _editorLoaded = false;
  private _id: TextDocId;

  get activeReference(): Readonly<ScriptureReference> {
    return this._activeReference;
  }

  get isEditorLoaded(): boolean {
    return this._editorLoaded;
  }

  get id() {
    return this._id;
  }

  applyFontChange(fontSize: string) {
    this.textComponent.editorStyles = {
      fontSize: fontSize
    };
  }

  highlightReferences() {
    this._editorLoaded = true;
    if (this.mode === 'checking') {
      if (this.references) {
        const segments: string[] = [];
        for (const reference of this.references) {
          const referenceSegments = this.getReferenceSegments(reference);
          if (referenceSegments.length) {
            this.setupQuestionSegments([referenceSegments[0]]);
            for (const segment of referenceSegments) {
              if (!segments.includes(segment)) {
                segments.push(segment);
              }
            }
          }
        }
        this.highlightSegments(segments);
        if (this.activeReference) {
          this.selectActiveReference(this.activeReference, true);
        }
      }
    } else {
      // In dialog mode, highlight the active reference without putting the ? marker before the text
      this.highlightActiveReference(this._activeReference, true);
    }
  }

  highlightActiveReference(reference: ScriptureReference, toggle: boolean) {
    if (this.mode === 'dialog') {
      const segments = this.getReferenceSegments(reference);
      this.highlightSegments(segments, toggle);
    }
    this.selectActiveReference(reference, toggle);
  }

  private getReferenceSegments(question: ScriptureReference): string[] {
    const segments: string[] = [];
    let segment = '';
    if (question.scriptureStart) {
      const verseStart = verseRefDataToVerseRef(question.scriptureStart);
      let verseEnd = verseRefDataToVerseRef(question.scriptureEnd);
      if (!verseEnd.book) {
        verseEnd = verseStart;
      }
      for (let verse = verseStart.verseNum; verse <= verseEnd.verseNum; verse++) {
        segment = this.getSegment(verseStart.chapterNum, verse);
        if (!segments.includes(segment)) {
          segments.push(segment);
        }
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
      const element = this.textComponent.editor.container.querySelector('usx-segment[data-segment=' + segment + ']');
      this.subscribe(fromEvent(element, 'click'), (event: MouseEvent) => {
        let target = event.target;
        if (target['offsetParent']['nodeName'] === 'USX-SEGMENT') {
          target = target['offsetParent'];
        }
        if (target['nodeName'] === 'USX-SEGMENT') {
          const clickSegment = target['attributes']['data-segment'].value;
          const segmentParts = clickSegment.split('_', 3);
          const verseRefData: VerseRefData = {
            book: this._id.bookId,
            chapter: segmentParts[1],
            verse: segmentParts[2]
          };
          this.segmentClicked(verseRefData);
        }
      });
    }
  }

  private segmentClicked(verseRefData: VerseRefData) {
    const verseRef = verseRefDataToVerseRef(verseRefData);
    let bestMatch: ScriptureReference = {};

    for (const reference of this.references) {
      const verseStart = verseRefDataToVerseRef(reference.scriptureStart);
      let verseEnd = verseRefDataToVerseRef(reference.scriptureEnd);
      if (!verseEnd.book) {
        verseEnd = verseStart;
      }
      if (verseStart.chapterNum === verseRef.chapterNum && verseStart.verseNum === verseRef.verseNum) {
        bestMatch = reference;
        break;
      } else if (
        verseStart.chapterNum === verseRef.chapterNum &&
        verseStart.verseNum <= verseRef.verseNum &&
        verseEnd.verseNum >= verseRef.verseNum
      ) {
        bestMatch = reference;
      }
    }
    if (bestMatch) {
      this.referenceClicked.emit(bestMatch);
    }
  }

  private setupQuestionSegments(segments: string[]) {
    for (const segment of segments) {
      if (!this.textComponent.hasSegmentRange(segment)) {
        continue;
      }
      const range = this.textComponent.getSegmentRange(segment);
      Promise.resolve().then(() => {
        this.textComponent.editor.formatText(range.index, range.length, 'data-question', 'true', 'silent');
      });
    }
  }

  private selectActiveReference(reference: ScriptureReference, toggle: boolean) {
    for (const segment of this.getReferenceSegments(reference)) {
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
