import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@ngneat/transloco';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { TranslocoMarkupModule } from 'ngx-transloco-markup';
import { I18nStoryModule } from '../../../../xforge-common/i18n-story.module';
import { UICommonModule } from '../../../../xforge-common/ui-common.module';
import { ToggleBookComponent } from './toggle-book.component';

const meta: Meta = {
  title: 'Translate/ToggleBook',
  component: ToggleBookComponent,
  decorators: [
    moduleMetadata({
      imports: [UICommonModule, I18nStoryModule, CommonModule, TranslocoModule, TranslocoMarkupModule]
    })
  ],
  argTypes: {
    progress: { control: { type: 'range', min: 0, max: 1, step: 0.01 } }
  }
};

export default meta;

interface StoryState {
  book: number;
  progress?: number;
  hues: number[];
  selected: boolean;
  disabled: boolean;
}

type Story = StoryObj<StoryState>;

export const Default: Story = {
  args: {
    book: 1,
    progress: 0.37,
    hues: [0]
  }
};

export const Selected: Story = {
  args: {
    ...Default.args,
    selected: true
  }
};

export const TwoColor: Story = {
  args: {
    ...Selected.args,
    hues: [0, 240]
  }
};

export const ThreeColor: Story = {
  args: {
    ...Selected.args,
    hues: [0, 120, 240]
  }
};

export const Disabled: Story = {
  args: {
    book: 8,
    disabled: true
  }
};
