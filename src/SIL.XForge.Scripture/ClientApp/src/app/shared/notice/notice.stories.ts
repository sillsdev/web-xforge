import { CommonModule } from '@angular/common';
import { Meta, StoryFn } from '@storybook/angular';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { NoticeComponent } from '../../shared/notice/notice.component';

export default {
  title: 'Utility/Notice',
  component: NoticeComponent
} as Meta;

const Template: StoryFn = args => ({
  moduleMetadata: { imports: [UICommonModule, CommonModule] },
  props: args,
  template: `<app-notice [icon]="icon" [type]="type" [outline]="outline">{{ text }}</app-notice>`
});

export const Basic = Template.bind({});
Basic.args = { text: 'This is a notice', type: 'normal' };

export const BasicWithIcon = Template.bind({});
BasicWithIcon.args = { ...Basic.args, icon: 'info' };

export const Warning = Template.bind({});
Warning.args = { text: 'This is a warning', type: 'warning' };

export const WarningWithIcon = Template.bind({});
WarningWithIcon.args = { ...Warning.args, icon: 'warning' };

export const Error = Template.bind({});
Error.args = { text: 'This is an error', type: 'error' };

export const ErrorWithIcon = Template.bind({});
ErrorWithIcon.args = { ...Error.args, icon: 'error' };

export const Outline = Template.bind({});
Outline.args = { ...Basic.args, outline: true };

export const IconAndOutline = Template.bind({});
IconAndOutline.args = { ...Basic.args, icon: 'info', outline: true };

export const WrappingNoticeWithIcon = Template.bind({});
WrappingNoticeWithIcon.args = { text: 'This is a notice that wraps to multiple lines', type: 'normal', icon: 'info' };
WrappingNoticeWithIcon.parameters = {
  viewport: { defaultViewport: 'mobile1' }
};
