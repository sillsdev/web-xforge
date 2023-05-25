import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { within } from '@storybook/testing-library';
import { expect } from '@storybook/jest';
import { CommonModule } from '@angular/common';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SuggestionsComponent } from './suggestions.component';

const meta: Meta<SuggestionsComponent> = {
  title: 'Translate/Suggestions',
  component: SuggestionsComponent,
  decorators: [
    moduleMetadata({
      imports: [CommonModule, UICommonModule],
      declarations: [SuggestionsComponent]
    })
  ]
};
export default meta;

type Story = StoryObj<SuggestionsComponent>;

export const Default: Story = {
  args: {
    show: true,
    suggestions: [
      { words: ['there', 'was', 'dearth', 'in', 'the', 'earth'], confidence: 0.29 },
      { words: ['there', 'was', 'a', 'famine', 'in', 'the', 'land'], confidence: 0.21 }
    ]
  }
};

export const Loading: Story = {
  args: {
    ...Default.args,
    suggestions: []
  }
};

export const DefaultHasFirstSelected: Story = {
  args: {
    ...Default.args
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const options: HTMLElement[] = canvas.getAllByRole('option');
    expect(options[0].getAttribute('aria-selected')).toBe('true');
    expect(options[1].getAttribute('aria-selected')).toBe('false');
  }
};
