import { Meta } from '@storybook/angular';
import { NoticeService } from 'xforge-common/notice.service';
import { I18nStoryModule } from 'xforge-common/i18n-story.module';
import { DialogService } from 'xforge-common/dialog.service';
import { expect } from '@storybook/jest';
import { AudioRecorderDialogComponent } from './audio-recorder-dialog.component';
import {
  MatDialogLaunchComponent,
  matDialogStory,
  MatDialogStoryConfig
} from '../../../../.storybook/util/mat-dialog-launch';

export default {
  title: 'Shared/Audio Recorder',
  component: MatDialogLaunchComponent
} as Meta;

const dialogStoryConfig: MatDialogStoryConfig = {
  imports: [I18nStoryModule],
  providers: [DialogService, NoticeService],
  standaloneComponent: true
};

export const ReadyToRecord = matDialogStory(AudioRecorderDialogComponent, dialogStoryConfig);

export const Countdown = matDialogStory(AudioRecorderDialogComponent, dialogStoryConfig);
Countdown.args = {
  data: { countdown: true }
};
Countdown.play = async ({ canvasElement }) => {
  // Countdown should be visible
  await new Promise(resolve => setTimeout(resolve, 1));
  const countdownElement = canvasElement.querySelector('.countdown');
  expect(countdownElement).toHaveClass('animate');

  // The timer is only 3 seconds but give storybook enough time to process the media devices
  await new Promise(resolve => setTimeout(resolve, 4000));

  // Recording should have started
  const stopButton = canvasElement.querySelector('.no-attachment .stop');
  expect(stopButton).toHaveClass('stop');
  expect(stopButton).toBeVisible();
};

export const ExistingAudio = matDialogStory(AudioRecorderDialogComponent, dialogStoryConfig);
ExistingAudio.args = {
  data: { audio: { status: 'processed', url: './test-audio-player.webm' } }
};
