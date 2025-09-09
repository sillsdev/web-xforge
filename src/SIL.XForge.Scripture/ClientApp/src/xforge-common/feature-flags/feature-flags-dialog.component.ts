import { Component } from '@angular/core';
import { FeatureFlagService } from './feature-flag.service';

@Component({
    templateUrl: './feature-flags-dialog.component.html',
    styleUrls: ['./feature-flags-dialog.component.scss'],
    standalone: false
})
export class FeatureFlagsDialogComponent {
  constructor(readonly featureFlags: FeatureFlagService) {}
}
