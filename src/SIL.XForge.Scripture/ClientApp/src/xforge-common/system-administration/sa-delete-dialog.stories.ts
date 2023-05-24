import { Meta } from '@storybook/angular';
import { MatDialogLaunchComponent, matDialogStory } from '../../../.storybook/util/mat-dialog-launch';
import { AvatarTestingModule } from '../avatar/avatar-testing.module';
import { SaDeleteDialogComponent } from './sa-delete-dialog.component';

export default {
  title: 'System Admin',
  component: MatDialogLaunchComponent
} as Meta;

export const DeleteUserDialog = matDialogStory(SaDeleteDialogComponent, {
  imports: [AvatarTestingModule]
});

DeleteUserDialog.args = {
  data: {
    user: {
      name: 'Billy T James',
      email: 'user01@example.com'
    }
  }
};
