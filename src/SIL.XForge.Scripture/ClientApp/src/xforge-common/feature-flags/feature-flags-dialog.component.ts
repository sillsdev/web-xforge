import { Component } from '@angular/core';
import { FeatureFlagService } from './feature-flag.service';
import { MatDialogTitle, MatDialogContent } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { CdkScrollable } from '@angular/cdk/scrolling';
import { NoticeComponent } from '../../app/shared/notice/notice.component';
import { MatCheckbox } from '@angular/material/checkbox';
import { FormsModule } from '@angular/forms';

@Component({
  templateUrl: './feature-flags-dialog.component.html',
  styleUrls: ['./feature-flags-dialog.component.scss'],
  imports: [MatDialogTitle, MatIcon, CdkScrollable, MatDialogContent, NoticeComponent, MatCheckbox, FormsModule]
})
export class FeatureFlagsDialogComponent {
  constructor(readonly featureFlags: FeatureFlagService) {}
}
