import { CommonModule } from '@angular/common';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { Meta, Story } from '@storybook/angular';
import { userEvent, within } from '@storybook/testing-library';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { expect } from '@storybook/jest';
import { CheckingCommentFormComponent } from './checking-comment-form.component';

export default {
  title: 'Checking/Comments/Comment Form',
  component: CheckingCommentFormComponent,
  argTypes: {
    text: { control: 'text' }
  }
} as Meta;

const Template: Story = args => ({
  moduleMetadata: {
    imports: [CommonModule, UICommonModule, BrowserAnimationsModule]
  },
  props: args
});

export const NewForm = Template.bind({});

export const EditForm = Template.bind({});
EditForm.args = { text: 'This is a comment' };

export const InvalidForm = Template.bind({});
InvalidForm.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const saveButton = await canvas.getByRole('button', { name: /Save/i });
  await userEvent.click(saveButton);
  const error = await canvas.getByText(/You need to enter your comment before saving/i);
  (expect(error) as any).toBeInTheDocument();
};
