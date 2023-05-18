import { Component, Inject, OnInit } from '@angular/core';
import { MatDialog, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { Meta, StoryFn } from '@storybook/angular';
import { SystemRole } from 'realtime-server/lib/esm/common/models/system-role';
import { MatButtonModule } from '@angular/material/button';
import { SaDeleteDialogComponent } from './sa-delete-dialog.component';

@Component({ template: '' })
export class MatDialogLaunchComponent implements OnInit {
  constructor(private dialog: MatDialog, @Inject(MAT_DIALOG_DATA) public data: any) {}

  public ngOnInit(): void {
    this.dialog.open(SaDeleteDialogComponent, this.data);
  }
}

export default {
  title: 'System Admin',
  component: MatDialogLaunchComponent
} as Meta;

export const DeleteUserDialog: StoryFn = args => ({
  moduleMetadata: {
    imports: [MatButtonModule, MatDialogModule],
    declarations: [SaDeleteDialogComponent],
    providers: [{ provide: MAT_DIALOG_DATA, useValue: { data: args.data } }]
  },
  props: args
});

DeleteUserDialog.args = {
  data: {
    user: {
      name: 'Billy T James',
      displayName: 'Billy T James',
      isDisplayNameConfirmed: true,
      email: 'user01@example.com',
      avatarUrl: '',
      authId: 'auth01',
      role: SystemRole.User,
      sites: {}
    }
  }
};
