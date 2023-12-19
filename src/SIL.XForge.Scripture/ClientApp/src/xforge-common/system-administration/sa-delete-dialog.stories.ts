import { Meta } from '@storybook/angular';
import { AvatarComponent } from 'xforge-common/avatar/avatar.component';
import { MatDialogLaunchComponent, matDialogStory } from '../../../.storybook/util/mat-dialog-launch';
import { SaDeleteDialogComponent } from './sa-delete-dialog.component';

export default {
  title: 'System Admin',
  component: MatDialogLaunchComponent
} as Meta;

export const DeleteUserDialog = matDialogStory(SaDeleteDialogComponent, {
  imports: [AvatarComponent]
});

DeleteUserDialog.args = {
  data: {
    user: {
      name: 'Billy T James',
      email: 'user01@example.com'
    }
  }
};
