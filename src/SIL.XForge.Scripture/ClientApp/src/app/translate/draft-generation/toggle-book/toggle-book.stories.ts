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
    progress: { control: { type: 'range', min: 0, max: 1, step: 0.01 } },
    selected: { control: 'boolean' },
    text: { control: 'text' }
  },
  render: args => ({
    props: args,
    template: `<app-toggle-book [selected]="selected" [disabled]="disabled" [progress]="progress">${args.text}</app-toggle-book>`
  })
};

export default meta;

type Story = StoryObj<ToggleBookComponent & { text: string }>;

export const Default: Story = {
  args: {
    text: 'Genesis',
    selected: false,
    progress: 0.37
  }
};

export const Selected: Story = {
  args: {
    ...Default.args,
    selected: true
  }
};

export const Disabled: Story = {
  args: {
    ...Default.args,
    disabled: true
  }
};

export const RTL: Story = {
  args: {
    ...Default.args,
    text: 'تكوين'
  },
  parameters: {
    locale: 'ar'
  }
};
