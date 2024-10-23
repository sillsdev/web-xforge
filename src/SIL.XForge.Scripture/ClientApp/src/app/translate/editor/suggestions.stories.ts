import { CommonModule } from '@angular/common';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { expect, within } from '@storybook/test';
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
      {
        words: ['there', 'was', 'dearth', 'in', 'the', 'earth'],
        confidence: 0.29
      },
      {
        words: ['there', 'was', 'a', 'famine', 'in', 'the', 'land'],
        confidence: 0.21
      }
    ]
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const options: HTMLElement[] = canvas.getAllByRole('option');
    expect(options[0].getAttribute('aria-selected')).toBe('true');
    expect(options[1].getAttribute('aria-selected')).toBe('false');
  }
};

export const RTLSuggestions: Story = {
  args: {
    show: true,
    suggestions: [
      {
        words: ' وَعَمَّتْ تِلْكَ الْبِلادَ مَجَاعَةٌ'.split(' '),
        confidence: 0.29
      },
      {
        words: 'ثُمَّ حَدَثْتْ مَجَاعَةٌ فِي الأرْضِ'.split(' '),
        confidence: 0.21
      }
    ]
  },
  parameters: { locale: 'ar' }
};

export const Loading: Story = {
  args: {
    ...Default.args,
    suggestions: []
  }
};
