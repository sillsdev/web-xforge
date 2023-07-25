import { CommonModule } from '@angular/common';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { userEvent, within } from '@storybook/testing-library';
import { of } from 'rxjs';
import { instance, mock, when } from 'ts-mockito';
import { I18nStoryModule } from 'xforge-common/i18n-story.module';
import { PwaService } from 'xforge-common/pwa.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { AudioPlayerComponent } from '../../../shared/audio/audio-player/audio-player.component';
import { AudioTimePipe } from '../../../shared/audio/audio-time-pipe';
import { CheckingAudioPlayerNewComponent } from './checking-audio-player-new.component';

const mockedPwaService = mock(PwaService);
when(mockedPwaService.isOnline).thenReturn(true);
when(mockedPwaService.onlineStatus$).thenReturn(of(true));

const meta: Meta<CheckingAudioPlayerNewComponent> = {
  title: 'Components/Checking Audio',
  component: CheckingAudioPlayerNewComponent,
  decorators: [
    moduleMetadata({
      imports: [UICommonModule, CommonModule, I18nStoryModule],
      declarations: [CheckingAudioPlayerNewComponent, AudioPlayerComponent, AudioTimePipe],
      providers: [{ provide: PwaService, useValue: instance(mockedPwaService) }]
    })
  ],
  args: { source: './test-audio-player.webm' }
};

export default meta;

type Story = StoryObj<CheckingAudioPlayerNewComponent>;

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
  }
};
