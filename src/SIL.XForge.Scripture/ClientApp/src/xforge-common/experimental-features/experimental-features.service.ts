import { Injectable } from '@angular/core';
import { FeatureFlag } from '../feature-flags/feature-flag.service';

/** Wraps a feature flag as an experimental feature, giving it a name, description, and availability check */
export interface ExperimentalFeature {
  name: string;
  description: string;
  available: () => boolean;
  featureFlag: FeatureFlag;
}

@Injectable({ providedIn: 'root' })
export class ExperimentalFeaturesService {
  /** Experimental features that users can opt in to. Only populated when there are live experimental features. */
  public experimentalFeatures: ExperimentalFeature[] = [];

  public get availableExperimentalFeatures(): ExperimentalFeature[] {
    return this.experimentalFeatures.filter(feature => feature.available());
  }

  public get showExperimentalFeaturesInMenu(): boolean {
    return this.availableExperimentalFeatures.length > 0;
  }
}
