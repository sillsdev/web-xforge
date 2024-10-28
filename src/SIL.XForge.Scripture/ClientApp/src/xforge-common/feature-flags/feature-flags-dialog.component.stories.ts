import { Meta } from '@storybook/angular';
import { instance, mock, when } from 'ts-mockito';
import { matDialogStory } from '../../../.storybook/util/mat-dialog-launch';
import { FeatureFlagService } from './feature-flag.service';
import { FeatureFlagsDialogComponent } from './feature-flags-dialog.component';

const mockedFeatureFlagService = mock(FeatureFlagService);
when(mockedFeatureFlagService.featureFlags).thenReturn([
  {
    key: 'enabled_flag',
    description: 'enabled flag',
    enabled: true,
    position: 0,
    readonly: false
  },
  {
    key: 'disabled_flag',
    description: 'disabled flag',
    enabled: false,
    position: 1,
    readonly: false
  },
  {
    key: 'enabled_readonly',
    description: 'enabled readonly',
    enabled: true,
    position: 2,
    readonly: true
  },
  {
    key: 'disabled_readonly',
    description: 'disabled readonly',
    enabled: false,
    position: 3,
    readonly: true
  }
]);

export default {
  title: 'Feature Flags',
  component: FeatureFlagsDialogComponent
} as Meta;

export const FeatureFlagsDialog = matDialogStory(FeatureFlagsDialogComponent, {
  providers: [
    {
      provide: FeatureFlagService,
      useValue: instance(mockedFeatureFlagService)
    }
  ]
});
