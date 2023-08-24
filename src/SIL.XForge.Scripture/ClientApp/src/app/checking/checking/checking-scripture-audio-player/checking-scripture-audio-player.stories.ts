import { CommonModule } from '@angular/common';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { I18nStoryModule } from 'xforge-common/i18n-story.module';
import { instance, mock, when } from 'ts-mockito';
import { PwaService } from 'xforge-common/pwa.service';
import { of } from 'rxjs';
import { SFProjectService } from '../../../core/sf-project.service';
import { AudioPlayerComponent } from '../../../shared/audio/audio-player/audio-player.component';
import { AudioTimePipe } from '../../../shared/audio/audio-time-pipe';
import { CheckingScriptureAudioPlayerComponent } from './checking-scripture-audio-player.component';

const mockedSFProjectService = mock(SFProjectService);
const mockedPwaService = mock(PwaService);

interface StoryAppState {
  online: boolean;
  source: string;
}

const defaultArgs: StoryAppState = {
  online: true,
  source: './test-audio-player.webm'
};

const meta: Meta = {
  title: 'Checking/Scripture Audio',
  component: CheckingScriptureAudioPlayerComponent,
  argTypes: {
    online: {
      description: 'Is application online',
      table: { category: 'App state' }
    },
    source: {
      description: 'Audio file to play',
      table: { category: 'App state' }
    }
  },
  decorators: [
    moduleMetadata({
      imports: [UICommonModule, CommonModule, I18nStoryModule],
      declarations: [AudioPlayerComponent, AudioTimePipe],
      providers: [
        { provide: SFProjectService, useValue: instance(mockedSFProjectService) },
        { provide: PwaService, useValue: instance(mockedPwaService) }
      ]
    }),
    (story, context) => {
      when(mockedPwaService.onlineStatus$).thenReturn(of(context.args.online));
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
};

export default meta;

type Story = StoryObj<StoryAppState>;

export const Default: Story = {};
