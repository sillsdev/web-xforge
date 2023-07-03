import { CommonModule } from '@angular/common';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { of } from 'rxjs';
import { instance, mock, when } from 'ts-mockito';
import { I18nStoryModule } from 'xforge-common/i18n-story.module';
import { PwaService } from 'xforge-common/pwa.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { AudioPlayerComponent, AudioTimePipe } from './audio-player.component';

const mockedPwaService = mock(PwaService);
when(mockedPwaService.isOnline).thenReturn(true);
when(mockedPwaService.onlineStatus$).thenReturn(of(true));

const meta: Meta<AudioPlayerComponent> = {
  title: 'Components/Audio Player Base',
  component: AudioPlayerComponent,
  decorators: [
    moduleMetadata({
      imports: [UICommonModule, CommonModule, I18nStoryModule],
      declarations: [AudioTimePipe],
      providers: [{ provide: PwaService, useValue: instance(mockedPwaService) }]
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
