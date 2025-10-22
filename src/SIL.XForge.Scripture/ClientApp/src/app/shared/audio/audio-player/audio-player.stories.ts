import { CommonModule } from '@angular/common';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { of } from 'rxjs';
import { instance, mock, when } from 'ts-mockito';
import { provideI18nStory } from 'xforge-common/i18n-story';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { AudioTimePipe } from '../audio-time-pipe';
import { AudioPlayerComponent } from './audio-player.component';

const mockedOnlineStatusService = mock(OnlineStatusService);
when(mockedOnlineStatusService.isOnline).thenReturn(true);
when(mockedOnlineStatusService.onlineStatus$).thenReturn(of(true));

const meta: Meta<AudioPlayerComponent> = {
  title: 'Components/Audio Player Base',
  component: AudioPlayerComponent,
  decorators: [
    moduleMetadata({
      imports: [CommonModule, AudioTimePipe],
      providers: [
        provideI18nStory() as any,
        { provide: OnlineStatusService, useValue: instance(mockedOnlineStatusService) }
      ]
    })
  ],
  args: { source: './test-audio-player.webm' }
};

export default meta;

type Story = StoryObj<AudioPlayerComponent>;

export const Default: Story = {};

export const NoSource: Story = {
  args: { source: '' }
};
