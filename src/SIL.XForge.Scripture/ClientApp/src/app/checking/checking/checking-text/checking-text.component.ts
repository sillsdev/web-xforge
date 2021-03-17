import { Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { translate } from '@ngneat/transloco';
import clone from 'lodash-es/clone';
import isEqual from 'lodash-es/isEqual';
import { VerseRef } from 'realtime-server/lib/scriptureforge/scripture-utils/verse-ref';
import { fromEvent, Subscription } from 'rxjs';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { TextDocId } from '../../../core/models/text-doc';
import { TextComponent } from '../../../shared/text/text.component';
import { verseRefFromMouseEvent } from '../../../shared/utils';

@Component({
  selector: 'app-checking-text',
  templateUrl: './checking-text.component.html',
  styleUrls: ['./checking-text.component.scss']
})
export class CheckingTextComponent extends SubscriptionDisposable {
  @ViewChild(TextComponent, { static: true }) textComponent!: TextComponent;
  @Output() questionVerseSelected = new EventEmitter<VerseRef>();
  @Input() isRightToLeft: boolean = false;

  private clickSubs: Subscription[] = [];
  private _activeVerse?: VerseRef;
  private _editorLoaded = false;
  private _id?: TextDocId;
  private _questionVerses?: VerseRef[];
  private _placeholder?: string;

  @Input() set placeholder(value: string) {
    this._placeholder = value;
  }

  get placeholder() {
    return this._placeholder || translate('text.loading');
  }

  @Input() set activeVerse(verseRef: VerseRef | undefined) {
    this._activeVerse = verseRef;
    this.highlightActiveVerse();
    this.scrollToActiveVerse();
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

  @Input() set fontSize(fontSize: string) {
    this.textComponent.editorStyles = { fontSize };
  }

  onLoaded(): void {
    this._editorLoaded = true;
    this.toggleQuestionVerses(true);
    this.highlightActiveVerse();
    this.scrollToActiveVerse();
  }

  private toggleQuestionVerses(value: boolean): void {
    if (!this.isEditorLoaded || this.questionVerses == null) {
      return;
    }
    const segments = this.textComponent.toggleFeaturedVerseRefs(value, this.questionVerses, 'checking');
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

    const refs = this.textComponent.getVerseSegments(this._activeVerse);
    this.textComponent.highlight(refs);
  }
  /*
  private toggleQuestionSegments(questionCounts: Map<string, number>, segments: string[], value: boolean): void {
    if (this.textComponent.editor == null) {
      return;
    }

    for (const segment of segments) {
      const range = this.textComponent.getSegmentRange(segment);
      const element = this.textComponent.getSegmentElement(segment);
      if (range == null || element == null) {
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
*/
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
          const verseRef = verseRefFromMouseEvent(event, this._id.bookNum);
          if (verseRef != null) {
            this.questionVerseSelected.emit(verseRef);
          }
        })
      );
    }
  }

  private scrollToActiveVerse() {
    if (this.activeVerse != null && this.textComponent.editor != null) {
      const firstSegment = this.textComponent.getVerseSegments(this.activeVerse)[0];
      const editor = this.textComponent.editor.container.querySelector('.ql-editor');
      if (firstSegment != null && editor != null) {
        const element = this.textComponent.getSegmentElement(firstSegment) as HTMLElement;
        if (element != null) {
          editor.scrollTo({ top: element.offsetTop - 20, behavior: 'smooth' });
        }
      }
    }
  }
}
