import { Meta } from '@storybook/angular';
import {
  BrowserIssue,
  SupportedBrowsersDialogComponent
} from 'xforge-common/supported-browsers-dialog/supported-browsers-dialog.component';
import { MatDialogLaunchComponent, matDialogStory } from '../../../.storybook/util/mat-dialog-launch';

const meta: Meta = {
  title: 'Misc/Dialogs',
  component: MatDialogLaunchComponent
};
export default meta;

export const BrowserUnsupportedDialog = matDialogStory(SupportedBrowsersDialogComponent);
BrowserUnsupportedDialog.args = { data: BrowserIssue.Upgrade };

export const AudioUnsupportedDialog = matDialogStory(SupportedBrowsersDialogComponent);
AudioUnsupportedDialog.args = { data: BrowserIssue.AudioRecording };
