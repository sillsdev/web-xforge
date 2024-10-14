import { CommonModule } from '@angular/common';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { of } from 'rxjs';
import { instance, mock, when } from 'ts-mockito';
import { I18nStoryModule } from 'xforge-common/i18n-story.module';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
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
      imports: [UICommonModule, CommonModule, I18nStoryModule],
      declarations: [AudioTimePipe],
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

type Story = StoryObj<AudioPlayerComponent>;

export const Default: Story = {};

export const NoSource: Story = {
  args: { source: '' }
};
