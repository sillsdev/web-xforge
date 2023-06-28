import { Component, Input } from '@angular/core';
import { toVerseRef, VerseRefData } from 'realtime-server/lib/esm/scriptureforge/models/verse-ref-data';
import { I18nService } from 'xforge-common/i18n.service';
import { QuestionDoc } from '../core/models/question-doc';

@Component({
  selector: 'app-checking-question',
  templateUrl: './checking-question.component.html',
  styleUrls: ['./checking-question.component.scss']
})
export class CheckingQuestionComponent {
  @Input() questionDoc?: QuestionDoc;

  constructor(private readonly i18n: I18nService) {}

  get referenceForDisplay(): string {
    const verseRefData: VerseRefData | undefined = this.questionDoc?.data?.verseRef;
    return verseRefData ? this.i18n.localizeReference(toVerseRef(verseRefData)) : '';
  }

  get questionText(): string {
    return this.questionDoc?.data?.text ?? '';
  }

  get audioUrl(): string | undefined {
    // TODO (scripture audio) implement stub
    return '';
  }

  playScripture(): void {
    // TODO (scripture audio) implement stub
    alert('Not implemented yet');
  }

  playQuestion(): void {
    // TODO (scripture audio) implement stub
    alert('Not implemented yet');
  }
}
