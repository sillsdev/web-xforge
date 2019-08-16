import { Component, EventEmitter, Input, Output, ViewChild, ViewEncapsulation } from '@angular/core';

import { Question } from '../../../core/models/question';
import { VerseRef } from '../../../core/models/scripture/verse-ref';
import { TextDocId } from '../../../core/models/text-doc-id';
import { VerseRefData } from '../../../core/models/verse-ref-data';
import { TextComponent } from '../../../shared/text/text.component';

@Component({
  selector: 'app-checking-text',
  templateUrl: './checking-text.component.html',
  styleUrls: ['./checking-text.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class CheckingTextComponent {
  @ViewChild(TextComponent) textComponent: TextComponent;

  @Input() set activeQuestion(question: Readonly<Question>) {
    this._activeQuestion = question;
    if (this.activeQuestion && this.isEditorLoaded) {
      this.selectActiveQuestion();
    }
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
          this.textComponent.questionSegments([questionSegments[0]]);
          for (const segment of questionSegments) {
            if (!segments.includes(segment)) {
              segments.push(segment);
            }
          }
        }
      }
      this.textComponent.highlightSegments(segments);
      if (this.activeQuestion) {
        this.selectActiveQuestion();
      }
    }
  }

  segmentClicked(verseRefData: VerseRefData) {
    const verseRef = VerseRef.fromData(verseRefData);
    for (const question of this.questions) {
      const verseStart = VerseRef.fromData(question.scriptureStart);
      let verseEnd = VerseRef.fromData(question.scriptureEnd);
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

  private getQuestionSegments(question: Question): string[] {
    const segments: string[] = [];
    let segment = '';
    if (question.scriptureStart) {
      const verseStart = VerseRef.fromData(question.scriptureStart);
      let verseEnd = VerseRef.fromData(question.scriptureEnd);
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

  private selectActiveQuestion() {
    this.textComponent.editor.container.querySelectorAll('usx-segment[data-selected=true]').forEach(element => {
      element.removeAttribute('data-selected');
    });
    for (const segment of this.getQuestionSegments(this.activeQuestion)) {
      if (!this.textComponent.viewModel.hasSegmentRange(segment)) {
        continue;
      }
      this.textComponent.editor.container
        .querySelector('usx-segment[data-segment=' + segment + ']')
        .setAttribute('data-selected', 'true');
    }
  }
}
