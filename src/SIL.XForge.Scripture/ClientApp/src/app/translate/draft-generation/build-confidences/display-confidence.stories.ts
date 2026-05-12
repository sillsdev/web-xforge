import { Meta, StoryObj } from '@storybook/angular';
import { Confidence, UsabilityLabel } from './build-confidences';
import { DisplayConfidenceComponent } from './display-confidence.component';

const meta: Meta<DisplayConfidenceComponent> = {
  title: 'Draft/Display Confidence Label',
  component: DisplayConfidenceComponent
};
export default meta;

type Story = StoryObj<DisplayConfidenceComponent>;

export const GoodQuality: Story = {
  args: { confidence: { label: UsabilityLabel.Green } as Confidence }
};

export const ModerateQuality: Story = {
  args: { confidence: { label: UsabilityLabel.Yellow } as Confidence }
};

export const PoorQuality: Story = {
  args: { confidence: { label: UsabilityLabel.Red } as Confidence }
};

export const NotDefined: Story = {
  args: { confidence: undefined }
};
