import { FeatureFlag, FeatureFlagStore } from './feature-flag.service';

class TestFeatureFlagStore implements FeatureFlagStore {
  enabled: boolean = true;
}

export class TestFeatureFlag extends FeatureFlag {
  private isEnabled: boolean = true;

  constructor() {
    super(new TestFeatureFlagStore(), '');
  }

  get enabled(): boolean {
    return this.isEnabled;
  }

  set enabled(value: boolean) {
    this.isEnabled = value;
  }

  get flagVisibleInUI(): boolean {
    return true;
  }
}
