import { Meta, StoryObj } from '@storybook/angular';
import { InfoComponent } from './info.component';

const defaultArgs = {
  text: 'Some useful information.'
};

const meta: Meta<InfoComponent> = {
  title: 'Utility/Info',
  component: InfoComponent,
  args: defaultArgs
};
export default meta;

type Story = StoryObj<InfoComponent>;

export const Info: Story = {};
