import { CommonModule } from '@angular/common';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { I18nStoryModule } from 'xforge-common/i18n-story.module';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SettingsComponent } from './settings.component';

const meta: Meta<SettingsComponent> = {
  title: 'Settings/Audio',
  component: SettingsComponent,
  decorators: [
    moduleMetadata({
      imports: [CommonModule, UICommonModule, I18nStoryModule]
    })
  ]
};
export default meta;
type Story = StoryObj<SettingsComponent>;
export const MyStory: Story = {};
