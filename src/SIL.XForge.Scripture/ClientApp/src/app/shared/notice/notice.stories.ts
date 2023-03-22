import { CommonModule } from '@angular/common';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { Meta, Story } from '@storybook/angular';
import { NoticeComponent } from 'src/app/shared/notice/notice.component';
import { UICommonModule } from 'xforge-common/ui-common.module';

export default {
  title: 'Utility/Notice',
  component: NoticeComponent
} as Meta;

const Template: Story = args => ({
  moduleMetadata: {
    imports: [UICommonModule, BrowserAnimationsModule, CommonModule]
  },
  props: args
});

export const Basic = Template.bind({});
Basic.args = { text: 'share_control.invitation_sent' };

export const BasicWithIcon = Template.bind({});
BasicWithIcon.args = { ...Basic.args, icon: 'info' };

export const Warning = Template.bind({});
Warning.args = { text: 'share_control.share_not_available_offline', type: 'warning' };

export const WarningWithIcon = Template.bind({});
WarningWithIcon.args = { ...Warning.args, icon: 'warning' };

export const Error = Template.bind({});
Error.args = { text: 'share_control.email_invalid', type: 'error' };

export const ErrorWithIcon = Template.bind({});
ErrorWithIcon.args = { ...Error.args, icon: 'error' };

export const Outline = Template.bind({});
Outline.args = { ...Basic.args, outline: true };

export const IconAndOutline = Template.bind({});
IconAndOutline.args = { ...Basic.args, icon: 'info', outline: true };
