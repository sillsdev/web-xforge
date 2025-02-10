import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatCheckboxChange } from '@angular/material/checkbox';
import { TranslocoModule } from '@ngneat/transloco';
import { TranslocoMarkupComponent } from 'ngx-transloco-markup';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { TranslateSource } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { I18nService } from 'xforge-common/i18n.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { AuthService } from '../../../../xforge-common/auth.service';
import { NoticeComponent } from '../../../shared/notice/notice.component';
import { DraftSourcesAsArrays } from '../draft-sources.service';
import { englishNameFromCode } from '../draft-utils';

@Component({
  selector: 'app-language-codes-confirmation',
  standalone: true,
  imports: [TranslocoModule, TranslocoMarkupComponent, UICommonModule, NoticeComponent],
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
  projectSettingsUrl: string = '';

  constructor(
    readonly i18n: I18nService,
    private readonly activatedProject: ActivatedProjectService,
    private readonly authService: AuthService
  ) {
    this.projectSettingsUrl = `/projects/${this.activatedProject.projectId}/settings`;
  }

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

  get isProjectAdmin(): boolean {
    const userId = this.authService.currentUserId;
    if (userId == null) return false;
    return this.activatedProject.projectDoc?.data?.userRoles[userId] === SFProjectRole.ParatextAdministrator;
  }

  confirmationChanged(event: MatCheckboxChange): void {
    this.languageCodesConfirmed = event.checked;
    this.languageCodesVerified.emit(event.checked);
  }
}
