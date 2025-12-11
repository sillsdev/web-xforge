import { Component, HostBinding, Input, Optional } from '@angular/core';
import { FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';

@Component({
  selector: 'app-dev-only',
  templateUrl: 'dev-only.component.html',
  styleUrls: ['dev-only.component.scss']
})
export class DevOnlyComponent {
  constructor(@Optional() private readonly featureFlags: FeatureFlagService) {}

  /**
   * If true, adds a visual annotation (border and label) around the content to indicate that it is only visible in dev
   * mode. Default is false.
   */
  @Input()
  @HostBinding('class.dev-only-annotate')
  annotate = false;

  @HostBinding('class.dev-mode')
  get isDevMode(): boolean {
    return this.featureFlags?.showDeveloperTools.enabled === true;
  }
}
