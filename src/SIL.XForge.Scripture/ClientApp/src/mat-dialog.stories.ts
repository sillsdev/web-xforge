import { Meta } from '@storybook/angular';
import { DeleteProjectDialogComponent } from './app/settings/delete-project-dialog/delete-project-dialog.component';
import { MatDialogLaunchComponent, matDialogStory } from '.storybook/story-utils';

const meta: Meta = {
  title: 'Material/Dialogs',
  component: MatDialogLaunchComponent
};
export default meta;

export const DeleteProjectDialog = matDialogStory(DeleteProjectDialogComponent);
DeleteProjectDialog.args = { data: { name: 'My Project' } };
