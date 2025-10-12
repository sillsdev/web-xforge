import { CommonModule } from '@angular/common';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { InfoComponent } from './info.component';

const defaultArgs = {
  text: 'Some useful information.'
};

const meta: Meta<InfoComponent> = {
  title: 'Utility/Info',
  component: InfoComponent,
  args: defaultArgs,
  decorators: [moduleMetadata({ imports: [CommonModule] })]
};
export default meta;

type Story = StoryObj<InfoComponent>;

export const Info: Story = {};
