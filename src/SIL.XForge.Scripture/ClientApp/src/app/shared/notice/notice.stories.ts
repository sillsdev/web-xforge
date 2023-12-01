import { Meta, StoryObj } from '@storybook/angular';
import { NoticeComponent } from '../../shared/notice/notice.component';
import { NoticeMode } from './notice.types';

interface NoticeComponentStoryState {
  mode: NoticeMode;
  showIcon: boolean;
  inline: boolean;
}

const defaultArgs: NoticeComponentStoryState = {
  mode: 'fill-dark',
  showIcon: true,
  inline: false
};

export default {
  title: 'Utility/Notice',
  component: NoticeComponent,
  args: defaultArgs,
  parameters: {
    controls: {
      include: Object.keys(defaultArgs)
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

        div {
          display: ${args.inline ? 'flex' : 'block'};
          flex-direction: column;
          align-items: flex-start;
        }
      </style>

      <div>
        <app-notice [icon]="showIcon ? (icon || 'info'): null" type="primary" [mode]="mode">Primary notice - stuff happened!</app-notice>
        <app-notice [icon]="showIcon ? (icon || 'info'): null" type="secondary" [mode]="mode">Secondary notice - stuff happened!</app-notice>
        <app-notice [icon]="showIcon ? (icon || 'check'): null" type="success" [mode]="mode">Success notice - stuff happened!</app-notice>
        <app-notice [icon]="showIcon ? (icon || 'warning'): null" type="warning" [mode]="mode">Warning notice - stuff happened!</app-notice>
        <app-notice [icon]="showIcon ? (icon || 'error'): null" type="error" [mode]="mode">Error notice - stuff happened!</app-notice>
        <app-notice [icon]="showIcon ? (icon || 'info'): null" type="info" [mode]="mode">Info notice - stuff happened!</app-notice>
        <app-notice [icon]="showIcon ? (icon || 'info'): null" type="light" [mode]="mode">Light notice - stuff happened!</app-notice>
        <app-notice [icon]="showIcon ? (icon || 'info'): null" type="dark" [mode]="mode">Dark notice - stuff happened!</app-notice>
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

export const WrappingText: Story = {
  ...FillDark,
  parameters: {
    viewport: { defaultViewport: 'mobile1' }
  }
};
