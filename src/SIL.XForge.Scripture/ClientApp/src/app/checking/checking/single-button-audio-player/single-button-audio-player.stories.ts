import { CommonModule } from '@angular/common';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SingleButtonAudioPlayerComponent } from './single-button-audio-player.component';

const meta: Meta<SingleButtonAudioPlayerComponent> = {
  title: 'Utility/Single Button Audio Player Component',
  component: SingleButtonAudioPlayerComponent,
  decorators: [moduleMetadata({ imports: [CommonModule, UICommonModule] })],
  args: {
    playing: false,
    progress: 0
  },
  argTypes: {
    progress: {
      control: {
        type: 'range',
        min: 0,
        max: 1,
        step: 0.01
      }
    }
  }
};

export default meta;

type Story = StoryObj<SingleButtonAudioPlayerComponent>;

export const Default: Story = {};

export const Playing: Story = {
  args: { playing: true, progress: 0.7 }
};

export const Finished: Story = {
  args: { playing: false, progress: 1 }
};
