import { Component, EventEmitter, Output } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { TranslocoModule } from '@ngneat/transloco';
import { firstValueFrom } from 'rxjs';
import { DialogService } from 'xforge-common/dialog.service';
import { BrandingService } from '../../core/branding.service';
import { SFProjectService } from '../../core/sf-project.service';
import { NoticeComponent } from '../notice/notice.component';
import { UserFeedbackDialogComponent, UserFeedbackDialogResult } from './user-feedback-dialog.component';

@Component({
  selector: 'app-user-feedback',
  imports: [NoticeComponent, TranslocoModule],
  templateUrl: './user-feedback.component.html',
  styleUrls: ['./user-feedback.component.scss']
})
export class UserFeedbackComponent {
  @Output() submitted = new EventEmitter<void>();

  constructor(
    private readonly dialogService: DialogService,
    private readonly projectService: SFProjectService,
    private readonly brandingService: BrandingService
  ) {}

  get siteName(): string {
    return this.brandingService.siteName;
  }

  async onSendFeedback(): Promise<void> {
    const dialogRef: MatDialogRef<UserFeedbackDialogComponent, UserFeedbackDialogResult | undefined> =
      this.dialogService.openMatDialog(UserFeedbackDialogComponent, { disableClose: true });
    const feedback: UserFeedbackDialogResult | undefined = await firstValueFrom(dialogRef.afterClosed());
    if (feedback != null) {
      void this.projectService.onlineAddUserFeedback(feedback);
      this.submitted.emit();
      void this.dialogService.message('user_feedback.thank_you_for_your_feedback', 'user_feedback.close');
    }
  }
}
