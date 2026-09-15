import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { defaultTranslocoMarkupTranspilers } from 'ngx-transloco-markup';
import { DisplayConfidenceComponent } from './display-confidence.component';

const meta: Meta<DisplayConfidenceComponent> = {
  title: 'Draft/Display Confidence Label',
  component: DisplayConfidenceComponent,
  decorators: [
    moduleMetadata({
      providers: [defaultTranslocoMarkupTranspilers()]
    })
  ]
};
export default meta;

type Story = StoryObj<DisplayConfidenceComponent>;

export const NotLowConfidence: Story = {
  args: { showIcon: false, showIconAndText: false }
};

export const LowConfidenceWithIconAndText: Story = {
  args: { showIcon: false, showIconAndText: true }
};

export const LowConfidenceIconOnly: Story = {
  args: { showIcon: true, showIconAndText: false }
};

export const NoticeOneBookWithName: Story = {
  args: { showNotice: true, bookNameWithLowConfidence: 'Genesis', booksWithLowConfidence: 1 }
};

export const NoticeOneBook: Story = {
  args: { showNotice: true, booksWithLowConfidence: 1 }
};

export const NoticeMultipleBooks: Story = {
  args: { showNotice: true, booksWithLowConfidence: 2 }
};
