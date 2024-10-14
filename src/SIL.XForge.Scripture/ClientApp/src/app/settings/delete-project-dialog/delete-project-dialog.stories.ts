import { Meta } from '@storybook/angular';
import { expect } from '@storybook/test';
import { userEvent, within } from '@storybook/test';
import { DeleteProjectDialogComponent } from './delete-project-dialog.component';
import { getOverlay, MatDialogLaunchComponent, matDialogStory } from '../../../../.storybook/util/mat-dialog-launch';

const meta: Meta = {
  title: 'Settings/Delete Project',
  component: MatDialogLaunchComponent
};
export default meta;

export const DeleteProjectInvalidDialog = matDialogStory(DeleteProjectDialogComponent);
DeleteProjectInvalidDialog.args = { data: { name: 'My Project' } };
DeleteProjectInvalidDialog.play = async ({ canvasElement }) => {
  const overlay = within(getOverlay(canvasElement));

  const submitButton = overlay.getByRole('button', {
    name: /I understand the consequences, delete this project/i
  });
  expect(submitButton).toBeDisabled();

  const projectInput = overlay.getByRole('textbox');
  await userEvent.type(projectInput, 'Other Project');

  expect(submitButton).toBeDisabled();
};

export const DeleteProjectValidDialog = matDialogStory(DeleteProjectDialogComponent);
DeleteProjectValidDialog.args = { data: { name: 'My Project' } };
DeleteProjectValidDialog.play = async ({ canvasElement }) => {
  const overlay = within(getOverlay(canvasElement));

  const submitButton = overlay.getByRole('button', {
    name: /I understand the consequences, delete this project/i
  });
  expect(submitButton).toBeDisabled();

  const projectInput = overlay.getByRole('textbox');
  await userEvent.type(projectInput, 'My Project');

  expect(submitButton).toBeEnabled();
};
