import { AsyncPipe } from '@angular/common';
import { Component, EventEmitter, Output } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nService } from 'xforge-common/i18n.service';
import { environment } from '../../../environments/environment';
import { BrandingService } from '../../core/branding.service';
import { SFProjectService } from '../../core/sf-project.service';
import { NoticeComponent } from '../notice/notice.component';
import { UserFeedbackDialogComponent, UserFeedbackDialogResult } from './user-feedback-dialog.component';

/** A notice asking the user for feedback, which opens the feedback dialog and submits what the user enters. */
@Component({
  selector: 'app-user-feedback',
  imports: [AsyncPipe, NoticeComponent],
  templateUrl: './user-feedback.component.html'
})
export class UserFeedbackComponent {
  @Output() submitted = new EventEmitter<void>();

  readonly feedbackPrompt = this.i18n.interpolate('user_feedback.has_drafting_helped_project_send_feedback', {
    siteName: this.brandingService.siteName
  });

  constructor(
    private readonly dialogService: DialogService,
    private readonly projectService: SFProjectService,
    private readonly brandingService: BrandingService,
    private readonly i18n: I18nService
  ) {}

  get issueEmail(): string {
    return environment.issueEmail;
  }

  async onSendFeedback(): Promise<void> {
    const dialogRef: MatDialogRef<UserFeedbackDialogComponent, UserFeedbackDialogResult | undefined> =
      this.dialogService.openMatDialog(UserFeedbackDialogComponent, { disableClose: true });
    const feedback: UserFeedbackDialogResult | undefined = await firstValueFrom(dialogRef.afterClosed());
    if (feedback != null) {
      try {
        await this.projectService.onlineAddUserFeedback(feedback.sfProjectId, feedback.feedbackParams);
        this.submitted.emit();
        void this.dialogService.message('user_feedback.thank_you_for_your_feedback', 'user_feedback.close');
      } catch {
        void this.dialogService.message('user_feedback.error_occurred', 'user_feedback.close');
      }
    }
  }
}
