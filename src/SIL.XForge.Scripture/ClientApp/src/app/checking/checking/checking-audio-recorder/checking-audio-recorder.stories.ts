import { CommonModule } from '@angular/common';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { userEvent, within } from '@storybook/testing-library';
import { of } from 'rxjs';
import { instance, mock, when } from 'ts-mockito';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nStoryModule } from 'xforge-common/i18n-story.module';
import { NoticeService } from 'xforge-common/notice.service';
import { PwaService } from 'xforge-common/pwa.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { AudioTimePipe, CheckingAudioPlayerComponent } from '../checking-audio-player/checking-audio-player.component';
import { CheckingAudioRecorderComponent } from './checking-audio-recorder.component';

const mockedNoticeService = mock(NoticeService);
const mockedPwaService = mock(PwaService);
const mockedNavigator = mock(Navigator);
const mockedDialogService = mock(DialogService);
when(mockedPwaService.isOnline).thenReturn(true);
when(mockedPwaService.onlineStatus$).thenReturn(of(true));

const rejectUserMedia = false;

when(mockedNavigator.mediaDevices).thenReturn({
  getUserMedia: (mediaConstraints: MediaStreamConstraints) =>
    rejectUserMedia ? Promise.reject() : navigator.mediaDevices.getUserMedia(mediaConstraints)
} as MediaDevices);

const meta: Meta<CheckingAudioRecorderComponent> = {
  title: 'Components/CheckingAudioRecorder',
  component: CheckingAudioRecorderComponent,
  decorators: [
    moduleMetadata({
      imports: [UICommonModule, CommonModule, I18nStoryModule],
      declarations: [CheckingAudioPlayerComponent, AudioTimePipe],
      providers: [
        { provide: NoticeService, useValue: instance(mockedNoticeService) },
        { provide: PwaService, useValue: instance(mockedPwaService) },
        { provide: DialogService, useValue: instance(mockedDialogService) }
      ]
    })
  ],
  argTypes: {
    liveRecording: {
      name: 'Live Recording',
      description: 'Whether to actually record audio, rather than mocking the recording process',
      control: 'boolean',
      defaultValue: false
    }
  } as any
  // render: (_component, _context) => ({
  //   // template: `
  //   //   <p *ngIf="!liveRecording">Audio recording is mocked</p>
  //   //   <p *ngIf="liveRecording">Actually recording audio; not mocking the recording process</p>
  //   //   <app-checking-audio-recorder></app-checking-audio-recorder>
  //   // `,
  //   // props: { liveRecording: true },
  //   moduleMetadata: {
  //     imports: [UICommonModule, CommonModule, I18nStoryModule],
  //     declarations: [CheckingAudioPlayerComponent, AudioTimePipe],
  //     providers: [
  //       { provide: NoticeService, useValue: instance(mockedNoticeService) },
  //       { provide: PwaService, useValue: instance(mockedPwaService) },
  //       { provide: NAVIGATOR, useValue: instance(mockedNavigator) }
  //     ]
  //   }
  // })
};

export default meta;

type Story = StoryObj<CheckingAudioRecorderComponent>;

export const Default: Story = {
  parameters: { liveRecording: false }
};

export const Recording: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const recordButton = await canvas.findByRole('button', { name: 'Record' });
    userEvent.click(recordButton);
  }
};

export const FinishedRecording: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const recordButton = await canvas.findByRole('button', { name: 'Record' });
    userEvent.click(recordButton);
    await new Promise(resolve => setTimeout(resolve, 200));
    const stopButton = await canvas.findByRole('button', { name: 'Stop Recording' });
    userEvent.click(stopButton);
  }
};

export const FinishedRecordingMobile: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  play: FinishedRecording.play
};
