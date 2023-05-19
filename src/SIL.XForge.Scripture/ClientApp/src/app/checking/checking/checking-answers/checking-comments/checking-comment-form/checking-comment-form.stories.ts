import { CommonModule } from '@angular/common';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { userEvent, within } from '@storybook/testing-library';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { expect } from '@storybook/jest';
import { I18nStoryModule } from 'xforge-common/i18n-story.module';
import { CheckingCommentFormComponent } from './checking-comment-form.component';

const meta: Meta<CheckingCommentFormComponent> = {
  title: 'Checking/Comments/Comment Form',
  component: CheckingCommentFormComponent
};
export default meta;

type Story = StoryObj<CheckingCommentFormComponent>;

const Template: Story = {
  decorators: [moduleMetadata({ imports: [CommonModule, UICommonModule, I18nStoryModule] })]
};

export const NewForm: Story = { ...Template };

export const EditForm: Story = {
  ...Template,
  args: { text: 'This is a comment' }
};

export const InvalidForm: Story = {
  ...Template,
  args: { text: '' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Only necessary because the autofocus directive has to use setTimeout
    await new Promise(resolve => setTimeout(resolve, 0));
    const saveButton = canvas.getByRole('button', { name: /Save/i });
    userEvent.click(saveButton);
    const error = canvas.getByText(/You need to enter your comment before saving/i);
    expect(error).toBeInTheDocument();
  }
};
