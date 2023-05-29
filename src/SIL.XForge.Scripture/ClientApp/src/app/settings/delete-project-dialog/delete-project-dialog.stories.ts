import { Meta } from '@storybook/angular';
import { userEvent } from '@storybook/testing-library';
import { expect } from '@storybook/jest';
import { DeleteProjectDialogComponent } from './delete-project-dialog.component';
import { MatDialogLaunchComponent, matDialogStory } from '.storybook/story-utils';

const meta: Meta = {
  title: 'Settings/Delete Project',
  component: MatDialogLaunchComponent
};
export default meta;

export const DeleteProjectInvalidDialog = matDialogStory(DeleteProjectDialogComponent);
DeleteProjectInvalidDialog.args = { data: { name: 'My Project' } };
DeleteProjectInvalidDialog.play = async ({}) => {
  const dialog: HTMLElement = document.querySelector('.mat-dialog-container')!;

  const submitButton = document.getElementById('project-delete-btn');
  expect(submitButton).toBeDisabled();

  const projectInput = dialog.querySelector('.mat-input-element')!;
  userEvent.type(projectInput, 'Other Project');

  expect(submitButton).toBeDisabled();
};

export const DeleteProjectValidDialog = matDialogStory(DeleteProjectDialogComponent);
DeleteProjectValidDialog.args = { data: { name: 'My Project' } };
DeleteProjectValidDialog.play = async ({}) => {
  const dialog: HTMLElement = document.querySelector('.mat-dialog-container')!;

  const submitButton = document.getElementById('project-delete-btn');
  expect(submitButton).toBeDisabled();

  const projectInput = dialog.querySelector('.mat-input-element')!;
  userEvent.type(projectInput, 'My Project');

  expect(submitButton).toBeEnabled();
};
