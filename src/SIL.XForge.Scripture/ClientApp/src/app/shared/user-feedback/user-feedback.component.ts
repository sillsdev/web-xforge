import { AsyncPipe } from '@angular/common';
import { Component, DestroyRef, Input } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatIconButton } from '@angular/material/button';
import { MatDialogRef } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import { ActivatedProjectUserConfigService } from 'xforge-common/activated-project-user-config.service';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nService } from 'xforge-common/i18n.service';
import { environment } from '../../../environments/environment';
import { BrandingService } from '../../core/branding.service';
import { SFProjectUserConfigDoc } from '../../core/models/sf-project-user-config-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { NoticeComponent } from '../notice/notice.component';
import {
  UserFeedbackDialogComponent,
  UserFeedbackDialogData,
  UserFeedbackDialogResult
} from './user-feedback-dialog.component';

/**
 * A notice asking the user for feedback, which opens the feedback dialog and submits what the user enters.
 */
@Component({
  selector: 'app-user-feedback',
  imports: [AsyncPipe, MatIcon, MatIconButton, NoticeComponent],
  templateUrl: './user-feedback.component.html',
  styleUrls: ['./user-feedback.component.scss']
})
export class UserFeedbackComponent {
  @Input() requireReferenceProject = false;

  readonly feedbackPrompt = this.i18n.interpolate('user_feedback.has_drafting_helped_project_send_feedback', {
    siteName: this.brandingService.siteName
  });

  private projectUserConfigDoc?: SFProjectUserConfigDoc;

  constructor(
    private readonly dialogService: DialogService,
    private readonly activatedProjectUserConfigService: ActivatedProjectUserConfigService,
    private readonly destroyRef: DestroyRef,
    private readonly projectService: SFProjectService,
    private readonly brandingService: BrandingService,
    private readonly i18n: I18nService
  ) {
    this.activatedProjectUserConfigService.projectUserConfigDoc$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(doc => (this.projectUserConfigDoc = doc));
  }

  get issueEmail(): string {
    return environment.issueEmail;
  }

  async onDismiss(): Promise<void> {
    await this.projectUserConfigDoc?.submitJson0Op(op =>
      op.set(puc => puc.draftFeedbackDismissalDate!, new Date().toISOString())
    );
  }

  async onSendFeedback(): Promise<void> {
    const dialogRef: MatDialogRef<UserFeedbackDialogComponent, UserFeedbackDialogResult | undefined> =
      this.dialogService.openMatDialog<UserFeedbackDialogComponent, UserFeedbackDialogData>(
        UserFeedbackDialogComponent,
        { disableClose: true, data: { requireProjectReference: this.requireReferenceProject } }
      );
    const feedback: UserFeedbackDialogResult | undefined = await firstValueFrom(dialogRef.afterClosed());
    if (feedback != null) {
      try {
        await this.projectService.onlineAddUserFeedback(feedback.sfProjectId, feedback.feedbackParams);
        void this.dialogService.message('user_feedback.thank_you_for_your_feedback', 'user_feedback.close');
      } catch {
        void this.dialogService.message('user_feedback.error_occurred', 'user_feedback.close');
      }
    }
  }
}
