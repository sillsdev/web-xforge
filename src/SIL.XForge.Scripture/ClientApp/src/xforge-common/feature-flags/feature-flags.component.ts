import { Component } from '@angular/core';
import { FeatureFlagService } from './feature-flag.service';

@Component({
  templateUrl: './feature-flags.component.html',
  styleUrls: ['./feature-flags.component.scss']
})
export class FeatureFlagsComponent {
  constructor(readonly featureFlags: FeatureFlagService) {}
}
