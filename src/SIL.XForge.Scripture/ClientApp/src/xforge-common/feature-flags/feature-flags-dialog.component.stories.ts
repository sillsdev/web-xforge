import { Meta } from '@storybook/angular';
import { instance, mock, when } from 'ts-mockito';
import { matDialogStory } from '../../../.storybook/util/mat-dialog-launch';
import { FeatureFlagService } from './feature-flag.service';
import { FeatureFlagsDialogComponent } from './feature-flags-dialog.component';

const mockedFeatureFlagService = mock(FeatureFlagService);
when(mockedFeatureFlagService.featureFlags).thenReturn([
  { description: 'enabled_flag', enabled: true, readonly: false },
  { description: 'disabled_flag', enabled: false, readonly: false },
  { description: 'readonly_flag', enabled: true, readonly: true }
]);

export default {
  title: 'Feature Flags',
  component: FeatureFlagsDialogComponent
} as Meta;

export const FeatureFlagsDialog = matDialogStory(FeatureFlagsDialogComponent, {
  providers: [{ provide: FeatureFlagService, useValue: instance(mockedFeatureFlagService) }]
});
