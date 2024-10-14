import { Meta, moduleMetadata } from '@storybook/angular';
import { NoticeService } from 'xforge-common/notice.service';
import { I18nStoryModule } from 'xforge-common/i18n-story.module';
import { DialogService } from 'xforge-common/dialog.service';
import { expect } from '@storybook/test';
import { instance, mock, when } from 'ts-mockito';
import { NAVIGATOR } from 'xforge-common/browser-globals';
import { userEvent } from '@storybook/test';
import {
  AudioAttachment,
  AudioRecorderDialogComponent,
  AudioRecorderDialogData
} from './audio-recorder-dialog.component';
import {
  MatDialogLaunchComponent,
  matDialogStory,
  MatDialogStoryConfig
} from '../../../../.storybook/util/mat-dialog-launch';
import { createMockMediaStream } from '../test-utils';

const mockedNavigator = mock(Navigator);

interface StoryAppState {
  audio: AudioAttachment;
  micAvailable: boolean;
  micPermission: boolean;
  countdown: boolean;
  data: AudioRecorderDialogData;
}

const defaultArgs: StoryAppState = {
  audio: {},
  micAvailable: true,
  micPermission: true,
  countdown: false,
  data: {}
};

export default {
  title: 'Shared/Audio Recorder',
  component: MatDialogLaunchComponent,
  argTypes: {
    audio: {
      description: 'Existing audio attachment',
      table: { category: 'Dialog data', type: { summary: 'AudioAttachment' } }
    },
    countdown: {
      control: { type: 'boolean' },
      description: 'Initiate with a countdown',
      table: { category: 'Dialog data' }
    },
    data: {
      description: 'Data to pass to the dialog',
      table: {
        category: 'Dialog data',
        type: { summary: 'AudioRecorderDialogData' }
      }
    },
    micAvailable: {
      control: { type: 'boolean' },
      description: 'Device has a microphone available for use',
      table: { category: 'App state' }
    },
    micPermission: {
      control: { type: 'boolean' },
      description: 'Permission to access the microphone',
      table: { category: 'App state' }
    }
  },
  decorators: [
    moduleMetadata({}),
    (story, context) => {
      context.args.data = {
        countdown: context.args.countdown
      } as AudioRecorderDialogData;
      when(mockedNavigator.mediaDevices).thenReturn({
        getUserMedia: (_: MediaStreamConstraints): Promise<MediaStream> => {
          return context.args.micPermission && context.args.micAvailable
            ? Promise.resolve(createMockMediaStream())
            : context.args.micAvailable
              ? Promise.reject('No microphone')
              : Promise.reject({ code: DOMException.NOT_FOUND_ERR });
        }
      } as MediaDevices);
      return story();
    }
  ],
  parameters: {
    controls: {
      expanded: true,
      include: Object.keys(defaultArgs)
    }
  },
  args: defaultArgs
} as Meta;

const dialogStoryConfig: MatDialogStoryConfig = {
  imports: [I18nStoryModule],
  providers: [DialogService, NoticeService, { provide: NAVIGATOR, useValue: instance(mockedNavigator) }],
  standaloneComponent: true
};

export const ReadyToRecord = matDialogStory(AudioRecorderDialogComponent, dialogStoryConfig);

export const Countdown = matDialogStory(AudioRecorderDialogComponent, dialogStoryConfig);
Countdown.args = {
  countdown: true
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
  audio: { status: 'processed', url: './test-audio-player.webm' }
};

export const PermissionDenied = matDialogStory(AudioRecorderDialogComponent, dialogStoryConfig);
PermissionDenied.args = {
  micPermission: false
};
PermissionDenied.play = async ({ canvasElement }) => {
  const recordButton = canvasElement.querySelector('.record');
  await userEvent.click(recordButton!);
  const notice = canvasElement.querySelector('simple-snack-bar');
  expect(notice?.textContent?.includes('Access to your microphone was denied')).toBeTruthy();
};

export const MicNotFound = matDialogStory(AudioRecorderDialogComponent, dialogStoryConfig);
MicNotFound.args = {
  micAvailable: false
};
MicNotFound.play = async ({ canvasElement }) => {
  const recordButton = canvasElement.querySelector('.record');
  await userEvent.click(recordButton!);
  const notice = canvasElement.querySelector('simple-snack-bar');
  expect(notice?.textContent?.includes('No microphone was found')).toBeTruthy();
};
