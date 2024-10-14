import { CommonModule } from '@angular/common';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from '@storybook/test';
import { I18nStoryModule } from 'xforge-common/i18n-story.module';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { CheckingCommentFormComponent } from './checking-comment-form.component';

const meta: Meta<CheckingCommentFormComponent> = {
  title: 'Checking/Comments/Comment Form',
  component: CheckingCommentFormComponent,
  decorators: [moduleMetadata({ imports: [CommonModule, UICommonModule, I18nStoryModule] })]
};
export default meta;

type Story = StoryObj<CheckingCommentFormComponent>;

export const NewForm: Story = {
  parameters: {
    // Disabled due to inconsistent rendering of Material outlined form field (the outline sometimes comes closer to the
    // label than at other times)
    chromatic: { disableSnapshot: true }
  }
};

export const EditForm: Story = {
  args: { text: 'This is a comment' },
  parameters: {
    // Disabled for the same reason the story above
    chromatic: { disableSnapshot: true }
  }
};

export const InvalidForm: Story = {
  args: { text: '' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Only necessary because the autofocus directive has to use setTimeout
    await new Promise(resolve => setTimeout(resolve, 0));
    const saveButton: HTMLElement = canvas.getByRole('button', {
      name: /Save/i
    });
    await userEvent.click(saveButton);
    const error: HTMLElement = canvas.getByText(/You need to enter your comment before saving/i);
    expect(error).toBeInTheDocument();
  }
};
