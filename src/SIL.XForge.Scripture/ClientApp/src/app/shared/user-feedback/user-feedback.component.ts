import { Component, DestroyRef } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { TranslocoModule } from '@ngneat/transloco';
import { DialogService } from 'xforge-common/dialog.service';
import { quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
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
  constructor(
    private readonly dialogService: DialogService,
    private readonly projectService: SFProjectService,
    private readonly brandingService: BrandingService,
    private readonly destroyRef: DestroyRef
  ) {}

  get siteName(): string {
    return this.brandingService.siteName;
  }

  onLeaveFeedback(): void {
    const dialogRef: MatDialogRef<UserFeedbackDialogComponent, UserFeedbackDialogResult | undefined> =
      this.dialogService.openMatDialog(UserFeedbackDialogComponent, { disableClose: true });
    dialogRef
      .afterClosed()
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(result => {
        if (result == null) return;
        void this.projectService.addUserFeedback(result);
      });
  }
}
