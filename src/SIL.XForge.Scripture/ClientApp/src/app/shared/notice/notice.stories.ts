import { MatLegacyButtonModule as MatButtonModule } from '@angular/material/legacy-button';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { NoticeComponent } from '../../shared/notice/notice.component';
import { NoticeMode, noticeModes } from './notice.types';

interface NoticeComponentStoryState {
  mode: NoticeMode;
  showIcon: boolean;
  showButton: boolean;
  inline: boolean;
}

const defaultArgs: NoticeComponentStoryState = {
  mode: 'fill-dark',
  showIcon: true,
  showButton: false,
  inline: false
};

export default {
  title: 'Utility/Notice',
  component: NoticeComponent,
  decorators: [
    moduleMetadata({
      imports: [MatButtonModule]
    })
  ],
  args: defaultArgs,
  parameters: {
    controls: {
      include: Object.keys(defaultArgs)
    }
  },
  argTypes: {
    mode: {
      options: noticeModes,
      control: { type: 'radio' }
    }
  }
} as Meta<NoticeComponentStoryState>;

type Story = StoryObj<NoticeComponentStoryState>;

const Template: Story = {
  render: args => ({
    props: args,
    template: `
      <style>
        app-notice {
          margin-bottom: 20px;
        }

        .notices {
          display: ${args.inline ? 'flex' : 'block'};
          flex-direction: column;
          align-items: flex-start;
        }

        .innards {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        button {
          display: ${args.showButton ? 'block' : 'none'};
          margin-inline-start: 20px;
        }
      </style>

      <div class="notices">
        <app-notice [icon]="showIcon ? (icon || 'info'): null" type="primary" [mode]="mode"><div class="innards">Primary notice - stuff happened! <button mat-flat-button>Learn more</button></div></app-notice>
        <app-notice [icon]="showIcon ? (icon || 'info'): null" type="secondary" [mode]="mode"><div class="innards">Secondary notice - stuff happened! <button mat-flat-button>Learn more</button></div></app-notice>
        <app-notice [icon]="showIcon ? (icon || 'check'): null" type="success" [mode]="mode"><div class="innards">Success notice - stuff happened! <button mat-flat-button>Learn more</button></div></app-notice>
        <app-notice [icon]="showIcon ? (icon || 'warning'): null" type="warning" [mode]="mode"><div class="innards">Warning notice - stuff happened! <button mat-flat-button>Learn more</button></div></app-notice>
        <app-notice [icon]="showIcon ? (icon || 'error'): null" type="error" [mode]="mode"><div class="innards">Error notice - stuff happened! <button mat-flat-button>Learn more</button></div></app-notice>
        <app-notice [icon]="showIcon ? (icon || 'info'): null" type="info" [mode]="mode"><div class="innards">Info notice - stuff happened! <button mat-flat-button>Learn more</button></div></app-notice>
        <app-notice [icon]="showIcon ? (icon || 'info'): null" type="light" [mode]="mode"><div class="innards">Light notice - stuff happened! <button mat-flat-button>Learn more</button></div></app-notice>
        <app-notice [icon]="showIcon ? (icon || 'info'): null" type="dark" [mode]="mode"><div class="innards">Dark notice - stuff happened! <button mat-flat-button>Learn more</button></div></app-notice>
      </div>
    `
  })
};

export const FillExtraDark: Story = {
  ...Template,
  args: {
    mode: 'fill-extra-dark'
  }
};

export const FillDark: Story = {
  ...Template,
  args: {
    mode: 'fill-dark'
  }
};

export const FillLight: Story = {
  ...Template,
  args: {
    mode: 'fill-light'
  }
};

export const Outline: Story = {
  ...Template,
  args: {
    mode: 'outline'
  }
};

export const NoIcon: Story = {
  ...Template,
  args: {
    mode: 'fill-light',
    showIcon: false
  }
};

export const WithButton: Story = {
  ...Template,
  args: {
    mode: 'fill-light',
    showButton: true
  }
};

export const WrappingText: Story = {
  ...FillDark,
  parameters: {
    viewport: { defaultViewport: 'mobile1' }
  }
};
