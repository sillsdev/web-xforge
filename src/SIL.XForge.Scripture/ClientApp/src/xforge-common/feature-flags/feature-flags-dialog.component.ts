import { CdkScrollable } from '@angular/cdk/scrolling';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatDialogContent, MatDialogTitle } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { NoticeComponent } from '../../app/shared/notice/notice.component';
import { FeatureFlagService } from './feature-flag.service';

@Component({
  templateUrl: './feature-flags-dialog.component.html',
  styleUrls: ['./feature-flags-dialog.component.scss'],
  imports: [MatDialogTitle, MatIcon, CdkScrollable, MatDialogContent, NoticeComponent, MatCheckbox, FormsModule]
})
export class FeatureFlagsDialogComponent {
  constructor(readonly featureFlags: FeatureFlagService) {}
}
