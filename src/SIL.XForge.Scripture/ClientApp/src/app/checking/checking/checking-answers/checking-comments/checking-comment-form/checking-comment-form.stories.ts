import { CommonModule } from '@angular/common';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { userEvent, within } from '@storybook/testing-library';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { expect } from '@storybook/jest';
import { I18nStoryModule } from 'xforge-common/i18n-story.module';
import { CheckingCommentFormComponent } from './checking-comment-form.component';

const meta: Meta<CheckingCommentFormComponent> = {
  title: 'Checking/Comments/Comment Form',
  component: CheckingCommentFormComponent,
  decorators: [moduleMetadata({ imports: [CommonModule, UICommonModule, I18nStoryModule] })]
};
export default meta;

type Story = StoryObj<CheckingCommentFormComponent>;

// The outlined form field has inconsistencies in how it renders the outline when focused.
// Using Chromatic's diff tool at
// https://6262c53f521620003ac2ff49-ukmsdlppcb.chromatic.com/?path=/story/stories-diff-threshold-check--test-yours-out
// it appears a diff threshold of about 0.66 is needed to ignore the differences. For good measure it's rounded up to
// 0.7. It may be possible to remove this after updating @angular/material.

export const NewForm: Story = {
  parameters: {
    chromatic: { diffThreshold: 0.7 }
  }
};

export const EditForm: Story = {
  args: { text: 'This is a comment' },
  parameters: {
    chromatic: { diffThreshold: 0.7 }
  }
};

export const InvalidForm: Story = {
  args: { text: '' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Only necessary because the autofocus directive has to use setTimeout
    await new Promise(resolve => setTimeout(resolve, 0));
    const saveButton: HTMLElement = canvas.getByRole('button', { name: /Save/i });
    userEvent.click(saveButton);
    const error: HTMLElement = canvas.getByText(/You need to enter your comment before saving/i);
    expect(error).toBeInTheDocument();
  }
};
