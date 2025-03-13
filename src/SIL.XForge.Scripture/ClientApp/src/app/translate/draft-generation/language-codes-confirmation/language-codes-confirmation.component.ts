import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatCheckboxChange } from '@angular/material/checkbox';
import { TranslocoModule } from '@ngneat/transloco';
import { TranslocoMarkupComponent } from 'ngx-transloco-markup';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { AuthService } from 'xforge-common/auth.service';
import { I18nService } from 'xforge-common/i18n.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SelectableProjectWithLanguageCode } from '../../../core/paratext.service';
import { NoticeComponent } from '../../../shared/notice/notice.component';
import { DraftSourcesAsSelectableProjectArrays, englishNameFromCode } from '../draft-utils';

@Component({
  selector: 'app-language-codes-confirmation',
  standalone: true,
  imports: [TranslocoModule, TranslocoMarkupComponent, UICommonModule, NoticeComponent],
  templateUrl: './language-codes-confirmation.component.html',
  styleUrl: './language-codes-confirmation.component.scss'
})
export class LanguageCodesConfirmationComponent {
  @Output() languageCodesVerified = new EventEmitter<boolean>(false);
  /** It makes sense to inform the user, except when the user is on the page for changing sources */
  @Input() informUserWhereToChangeDraftSources: boolean = true;
  @Input() set draftSources(value: DraftSourcesAsSelectableProjectArrays) {
    if (value == null) return;
    this.draftingSources = value.draftingSources;
    this.trainingSources = value.trainingSources;
    this.targetLanguageTag = value.trainingTargets[0]?.languageTag;
  }

  draftingSources: SelectableProjectWithLanguageCode[] = [];
  trainingSources: SelectableProjectWithLanguageCode[] = [];
  languageCodesConfirmed: boolean = false;
  targetLanguageTag?: string;
  configSourcesUrl: string = '';

  constructor(
    readonly i18n: I18nService,
    private readonly activatedProject: ActivatedProjectService,
    private readonly authService: AuthService
  ) {
    this.configSourcesUrl = `/projects/${this.activatedProject.projectId}/draft-generation/sources`;
  }

  get sourceSideLanguageCodes(): string[] {
    const sourceLanguagesCodes: string[] = [...this.draftingSources, ...this.trainingSources]
      .filter(s => s != null)
      .map(s => s.languageTag);
    const languageNames: string[] = Array.from(new Set(sourceLanguagesCodes.map(s => englishNameFromCode(s))));
    if (languageNames.length < 2) {
      return [sourceLanguagesCodes[0]];
    }
    return Array.from(new Set(sourceLanguagesCodes));
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
