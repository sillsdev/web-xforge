import { CommonModule } from '@angular/common';
import { Meta, StoryFn } from '@storybook/angular';
import { userEvent, within } from '@storybook/testing-library';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { expect } from '@storybook/jest';
import { I18nStoryModule } from 'xforge-common/i18n-story.module';
import { CheckingCommentFormComponent } from './checking-comment-form.component';

export default {
  title: 'Checking/Comments/Comment Form',
  component: CheckingCommentFormComponent,
  argTypes: {
    text: { control: 'text' }
  }
} as Meta;

const Template: StoryFn = args => ({
  moduleMetadata: { imports: [CommonModule, UICommonModule, I18nStoryModule] },
  props: args
});

export const NewForm = Template.bind({});

export const EditForm = Template.bind({});
EditForm.args = { text: 'This is a comment' };

export const InvalidForm = Template.bind({});
InvalidForm.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const saveButton = canvas.getByRole('button', { name: /Save/i });
  userEvent.click(saveButton);
  const error = canvas.getByText(/You need to enter your comment before saving/i);
  expect(error).toBeInTheDocument();
};
