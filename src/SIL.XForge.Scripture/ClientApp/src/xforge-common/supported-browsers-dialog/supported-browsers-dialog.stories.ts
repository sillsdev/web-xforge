import { CommonModule } from '@angular/common';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { I18nStoryModule } from 'xforge-common/i18n-story.module';
import { BrowserIssue, SupportedBrowsersDialogComponent } from './supported-browsers-dialog.component';

const meta: Meta<SupportedBrowsersDialogComponent> = {
  title: 'Misc/Supported Browsers',
  component: SupportedBrowsersDialogComponent
};
export default meta;

type Story = StoryObj<SupportedBrowsersDialogComponent>;

const Template: Story = {
  decorators: [
    moduleMetadata({
      imports: [CommonModule, UICommonModule, I18nStoryModule, MatDialogModule],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: {} },
        { provide: MatDialogRef, useValue: {} }
      ]
    })
  ]
};

export const NeedUpgradeForm: Story = {
  ...Template,
  args: { data: BrowserIssue.Upgrade }
};

export const AudioNotSupportedForm: Story = {
  ...Template,
  args: { data: BrowserIssue.AudioRecording }
};
