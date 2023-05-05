import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
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
