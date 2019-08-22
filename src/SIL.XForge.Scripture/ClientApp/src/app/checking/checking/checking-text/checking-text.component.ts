import { Component, EventEmitter, Input, Output, ViewChild, ViewEncapsulation } from '@angular/core';

import { fromEvent } from 'rxjs';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { Question } from '../../../core/models/question';
import { TextDocId } from '../../../core/models/text-doc-id';
import { VerseRefData, VerseRefFunctions } from '../../../core/models/verse-ref-data';
import { TextComponent } from '../../../shared/text/text.component';

@Component({
  selector: 'app-checking-text',
  templateUrl: './checking-text.component.html',
  styleUrls: ['./checking-text.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class CheckingTextComponent extends SubscriptionDisposable {
  @ViewChild(TextComponent) textComponent: TextComponent;

  @Input() set activeQuestion(question: Readonly<Question>) {
    if (this.activeQuestion && this.isEditorLoaded) {
      this.selectActiveQuestion(this.activeQuestion, false);
      this.selectActiveQuestion(question, true);
    }
    this._activeQuestion = question;
  }
  @Input() id: TextDocId;
  @Output() questionClicked: EventEmitter<Question> = new EventEmitter<Question>();
  @Input() questions: Readonly<Question[]> = [];

  private _activeQuestion: Readonly<Question>;
  private _editorLoaded = false;

  get activeQuestion(): Readonly<Question> {
    return this._activeQuestion;
  }

  get isEditorLoaded(): boolean {
    return this._editorLoaded;
  }

  applyFontChange(fontSize: string) {
    this.textComponent.editorStyles = {
      fontSize: fontSize
    };
  }

  highlightQuestions() {
    this._editorLoaded = true;
    if (this.questions) {
      const segments: string[] = [];
      for (const question of this.questions) {
        const questionSegments = this.getQuestionSegments(question);
        if (questionSegments.length) {
          this.setupQuestionSegments([questionSegments[0]]);
          for (const segment of questionSegments) {
            if (!segments.includes(segment)) {
              segments.push(segment);
            }
          }
        }
      }
      this.highlightSegments(segments);
      if (this.activeQuestion) {
        this.selectActiveQuestion(this.activeQuestion, true);
      }
    }
  }

  private getQuestionSegments(question: Question): string[] {
    const segments: string[] = [];
    let segment = '';
    if (question.scriptureStart) {
      const verseStart = VerseRefFunctions.fromData(question.scriptureStart);
      let verseEnd = VerseRefFunctions.fromData(question.scriptureEnd);
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

  private highlightSegments(segments: string[]) {
    for (const segment of segments) {
      if (!this.textComponent.hasSegmentRange(segment)) {
        continue;
      }
      const range = this.textComponent.getSegmentRange(segment);
      this.textComponent.toggleHighlight(true, range);
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
            book: this.id.bookId,
            chapter: segmentParts[1],
            verse: segmentParts[2]
          };
          this.segmentClicked(verseRefData);
        }
      });
    }
  }

  private segmentClicked(verseRefData: VerseRefData) {
    const verseRef = VerseRefFunctions.fromData(verseRefData);
    for (const question of this.questions) {
      const verseStart = VerseRefFunctions.fromData(question.scriptureStart);
      let verseEnd = VerseRefFunctions.fromData(question.scriptureEnd);
      if (!verseEnd.book) {
        verseEnd = verseStart;
      }
      if (
        verseStart.chapterNum === verseRef.chapterNum &&
        verseStart.verseNum <= verseRef.verseNum &&
        verseEnd.verseNum >= verseRef.verseNum
      ) {
        this.questionClicked.emit(question);
      }
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

  private selectActiveQuestion(question: Question, toggle: boolean) {
    for (const segment of this.getQuestionSegments(question)) {
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
