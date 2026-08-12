import { Meta, StoryObj } from '@storybook/angular';
import { DisplayConfidenceComponent } from './display-confidence.component';

const meta: Meta<DisplayConfidenceComponent> = {
  title: 'Draft/Display Confidence Label',
  component: DisplayConfidenceComponent
};
export default meta;

type Story = StoryObj<DisplayConfidenceComponent>;

export const NotLowQuality: Story = {
  args: { lowConfidence: false, showText: true }
};

export const LowQualityWithIconAndText: Story = {
  args: { lowConfidence: true, showText: true }
};

export const LowQualityIconOnly: Story = {
  args: { lowConfidence: true, showText: false }
};
