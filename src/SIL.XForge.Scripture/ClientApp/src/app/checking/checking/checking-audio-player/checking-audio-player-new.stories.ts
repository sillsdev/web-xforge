import { CommonModule } from '@angular/common';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { userEvent, within } from '@storybook/test';
import { of } from 'rxjs';
import { instance, mock, when } from 'ts-mockito';
import { I18nStoryModule } from 'xforge-common/i18n-story.module';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { AudioPlayerComponent } from '../../../shared/audio/audio-player/audio-player.component';
import { AudioTimePipe } from '../../../shared/audio/audio-time-pipe';
import { InfoComponent } from '../../../shared/info/info.component';
import { CheckingAudioPlayerComponent } from './checking-audio-player.component';

const mockedOnlineStatusService = mock(OnlineStatusService);
when(mockedOnlineStatusService.isOnline).thenReturn(true);
when(mockedOnlineStatusService.onlineStatus$).thenReturn(of(true));

const meta: Meta<CheckingAudioPlayerComponent> = {
  title: 'Components/Checking Audio',
  component: CheckingAudioPlayerComponent,
  decorators: [
    moduleMetadata({
      imports: [UICommonModule, CommonModule, I18nStoryModule],
      declarations: [CheckingAudioPlayerComponent, AudioPlayerComponent, AudioTimePipe, InfoComponent],
      providers: [
        {
          provide: OnlineStatusService,
          useValue: instance(mockedOnlineStatusService)
        }
      ]
    })
  ],
  args: { source: './test-audio-player.webm' }
};

export default meta;

type Story = StoryObj<CheckingAudioPlayerComponent>;

export const Default: Story = {};

export const NoSource: Story = {
  args: { source: '' }
};

export const Playing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await new Promise(resolve => setTimeout(resolve, 100));
    const play = await canvas.findByRole('button');
    userEvent.click(play);
  },
  parameters: {
    chromatic: { disableSnapshot: true }
  }
};
