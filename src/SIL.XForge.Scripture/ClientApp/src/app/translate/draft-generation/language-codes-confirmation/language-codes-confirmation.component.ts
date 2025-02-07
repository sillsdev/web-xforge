import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatCheckboxChange } from '@angular/material/checkbox';
import { TranslocoModule } from '@ngneat/transloco';
import { TranslateSource } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { I18nService } from 'xforge-common/i18n.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { NoticeComponent } from '../../../shared/notice/notice.component';
import { DraftSourcesAsArrays } from '../draft-sources.service';
import { englishNameFromCode } from '../draft-utils';

@Component({
  selector: 'app-language-codes-confirmation',
  standalone: true,
  imports: [TranslocoModule, UICommonModule, NoticeComponent],
  templateUrl: './language-codes-confirmation.component.html',
  styleUrl: './language-codes-confirmation.component.scss'
})
export class LanguageCodesConfirmationComponent {
  @Output() languageCodesVerified = new EventEmitter<boolean>(false);
  @Input() set draftSources(value: DraftSourcesAsArrays | undefined) {
    if (value == null) return;
    this.draftingSources = value.draftingSources;
    this.trainingSources = value.trainingSources;
    this.targetLanguageTag = value.trainingTargets[0]?.writingSystem.tag;
  }

  draftingSources: [TranslateSource?] = [];
  trainingSources: [TranslateSource?, TranslateSource?] = [];
  languageCodesConfirmed: boolean = false;
  targetLanguageTag?: string;

  constructor(readonly i18n: I18nService) {}

  get sourceSideLanguageCodes(): string[] {
    const sourceLanguagesCodes: string[] = [...this.draftingSources, ...this.trainingSources]
      .filter(s => s != null)
      .map(s => s.writingSystem.tag);
    const languageNames: string[] = Array.from(new Set(sourceLanguagesCodes.map(s => englishNameFromCode(s))));
    if (languageNames.length < 2) {
      return [sourceLanguagesCodes[0]];
    }
    return sourceLanguagesCodes;
  }

  get showSourceAndTargetLanguagesIdenticalWarning(): boolean {
    const sourceCodes: string[] = this.sourceSideLanguageCodes;
    return sourceCodes.length === 1 && sourceCodes[0] === this.targetLanguageTag;
  }

  confirmationChanged(event: MatCheckboxChange): void {
    this.languageCodesConfirmed = event.checked;
    this.languageCodesVerified.emit(event.checked);
  }
}
