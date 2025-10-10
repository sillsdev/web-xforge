import { MatIcon } from '@angular/material/icon';
import { componentWrapperDecorator, Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { WorkingAnimatedIndicatorComponent } from './working-animated-indicator.component';

export default {
  title: 'Utility/Working Animated Indicator',
  component: WorkingAnimatedIndicatorComponent,
  decorators: [
    moduleMetadata({
      imports: [MatIcon]
    }),
    componentWrapperDecorator(
      (story: string) => `
        <div style="font-size: {{ (storyProps$ | async).fontSize }}px">
        ${story}
        </div>
      `
    )
  ],
  argTypes: {
    fontSize: {
      control: {
        type: 'range',
        min: 12,
        max: 48
      }
    }
  },
  args: {
    fontSize: 16
  }
} as Meta<WorkingAnimatedIndicatorComponent>;

type Story = StoryObj<WorkingAnimatedIndicatorComponent>;

export const Default: Story = {};
