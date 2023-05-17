import { Component, Inject, OnInit } from '@angular/core';
import { MatDialog, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { Meta, StoryFn } from '@storybook/angular';
import { SystemRole } from 'realtime-server/lib/esm/common/models/system-role';
import { MatButtonModule } from '@angular/material/button';
import { AvatarComponent } from 'xforge-common/avatar/avatar.component';
import { AvatarModule } from 'ngx-avatar';
import { BehaviorSubject } from 'rxjs';
import { ServiceWorkerModule } from '@angular/service-worker';
import { PwaService } from '../pwa.service';
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
    imports: [MatButtonModule, MatDialogModule, ServiceWorkerModule.register('', { enabled: false }), AvatarModule],
    declarations: [
      // AvatarComponent,
      SaDeleteDialogComponent
    ],
    providers: [
      { provide: MAT_DIALOG_DATA, useValue: { data: args.data } },
      {
        provide: PwaService,
        useFactory: () => ({
          onlineStatus$: new BehaviorSubject(args.isOnline)
        })
      }
    ]
  },
  props: args
});

DeleteUserDialog.args = {
  isOnline: true,
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
