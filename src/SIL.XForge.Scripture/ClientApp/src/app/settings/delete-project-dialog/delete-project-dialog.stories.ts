import { CommonModule } from '@angular/common';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { userEvent, within } from '@storybook/testing-library';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { expect } from '@storybook/jest';
import { I18nStoryModule } from 'xforge-common/i18n-story.module';
import { DeleteProjectDialogComponent } from './delete-project-dialog.component';

const meta: Meta<DeleteProjectDialogComponent> = {
  title: 'Settings/Delete Project',
  component: DeleteProjectDialogComponent
};
export default meta;

type Story = StoryObj<DeleteProjectDialogComponent>;

const Template: Story = {
  decorators: [
    moduleMetadata({
      imports: [CommonModule, UICommonModule, I18nStoryModule, MatDialogModule],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { name: 'My Project' } },
        { provide: MatDialogRef, useValue: {} }
      ]
    })
  ]
};

export const NewForm: Story = { ...Template };

export const InvalidInputForm: Story = {
  ...Template,
  play: async ({ canvasElement }) => {
    const root = within(canvasElement);

    const submitButton = root.getByRole('button', { name: /Delete this project/i });
    expect(submitButton).toBeDisabled();

    const projectInput = root.getByRole('textbox');
    userEvent.type(projectInput, 'Other Project');

    expect(submitButton).toBeDisabled();
  }
};

export const ValidInputForm: Story = {
  ...Template,
  play: async ({ canvasElement }) => {
    const root = within(canvasElement);

    const submitButton = root.getByRole('button', { name: /Delete this project/i });
    expect(submitButton).toBeDisabled();

    const projectInput = root.getByRole('textbox');
    userEvent.type(projectInput, 'My Project');

    expect(submitButton).toBeEnabled();
  }
};
