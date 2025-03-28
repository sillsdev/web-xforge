import { CommonModule } from '@angular/common';
import { Component, DestroyRef, EventEmitter, Input, Output } from '@angular/core';
import { MatCheckboxChange } from '@angular/material/checkbox';
import { TranslocoModule } from '@ngneat/transloco';
import { TranslocoMarkupComponent } from 'ngx-transloco-markup';
import { I18nKeyForComponent, I18nService } from 'xforge-common/i18n.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { issuesEmailTemplate } from 'xforge-common/utils';
import { environment } from '../../../../environments/environment';
import { SelectableProjectWithLanguageCode } from '../../../core/paratext.service';
import { NoticeComponent } from '../../../shared/notice/notice.component';
import { DraftSourcesAsSelectableProjectArrays, normalizeLanguageCodeToISO639_3 } from '../draft-utils';

@Component({
  selector: 'app-language-codes-confirmation',
  standalone: true,
  imports: [CommonModule, TranslocoModule, TranslocoMarkupComponent, UICommonModule, NoticeComponent],
  templateUrl: './language-codes-confirmation.component.html',
  styleUrl: './language-codes-confirmation.component.scss'
})
export class LanguageCodesConfirmationComponent {
  @Input() set sources(value: DraftSourcesAsSelectableProjectArrays) {
    if (value == null) return;

    this.draftingSources = value.draftingSources;
    this.trainingSources = value.trainingSources;
    this.targetLanguageTag = value.trainingTargets[0]?.languageTag;
    this.updateMessageForContinuing();
  }
  @Input() set clearCheckbox(eventEmitter: EventEmitter<void>) {
    eventEmitter.pipe(quietTakeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.languageCodesConfirmed = false;
      this.updateMessageForContinuing();
    });
  }

  /**
   * A localization key for what message should be shown if the user attempts to continue. This will be null if the user
   * has confirmed the language codes.
   */
  @Output() messageIfUserTriesToContinue = new EventEmitter<I18nKeyForComponent<'draft_sources'> | null>();

  languageCodesConfirmed = false;

  draftingSources: SelectableProjectWithLanguageCode[] = [];
  trainingSources: SelectableProjectWithLanguageCode[] = [];
  targetLanguageTag?: string;

  constructor(
    readonly i18n: I18nService,
    private readonly destroyRef: DestroyRef
  ) {}

  get issueMailTo(): string {
    return issuesEmailTemplate();
  }

  get issueEmail(): string {
    return environment.issueEmail;
  }

  get sourceSideLanguageCodes(): string[] {
    return [...this.draftingSources, ...this.trainingSources]
      .map(s => s.languageTag)
      .filter(t => t != null && t !== '');
  }

  get uniqueSourceSideLanguageCodes(): string[] {
    return [...new Set(this.sourceSideLanguageCodes)];
  }

  get uniqueNormalizedSourceSideLanguageCodes(): string[] {
    return [...new Set(this.sourceSideLanguageCodes.map(normalizeLanguageCodeToISO639_3))];
  }

  checkboxChanged(event: MatCheckboxChange): void {
    this.languageCodesConfirmed = event.checked;
    this.updateMessageForContinuing();
  }

  updateMessageForContinuing(): void {
    if (this.showSourceLanguagesDifferError) {
      this.messageIfUserTriesToContinue.emit('source_side_language_codes_differ');
    } else if (!this.languageCodesConfirmed) {
      this.messageIfUserTriesToContinue.emit('confirm_language_codes');
    } else this.messageIfUserTriesToContinue.emit(null);
  }

  // SECTION: Logic for each notice

  get showStandardNotice(): boolean {
    return !this.showSourceLanguagesDifferError && !this.showSourceAndTargetLanguagesIdenticalWarning;
  }

  get showSourceAndTargetLanguagesIdenticalWarning(): boolean {
    if (this.targetLanguageTag == null) return false;
    const unique = this.uniqueNormalizedSourceSideLanguageCodes;
    return unique.length === 1 && unique[0] === normalizeLanguageCodeToISO639_3(this.targetLanguageTag);
  }

  get showSourceLanguagesDifferError(): boolean {
    return this.uniqueNormalizedSourceSideLanguageCodes.length > 1;
  }
}
