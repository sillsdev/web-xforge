import { CommonModule } from '@angular/common';
import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { ngfModule } from 'angular-file';
import { AvatarModule } from 'ngx-avatar';
import { AuthHttpInterceptor } from './auth-http-interceptor';
import { AvatarComponent } from './avatar/avatar.component';
import { EditNameDialogComponent } from './edit-name-dialog/edit-name-dialog.component';
import { ErrorComponent } from './error/error.component';
import { IndexeddbRealtimeOfflineStore } from './indexeddb-realtime-offline-store';
import { RealtimeOfflineStore } from './realtime-offline-store';
import { RealtimeRemoteStore } from './realtime-remote-store';
import { SharedbRealtimeRemoteStore } from './sharedb-realtime-remote-store';
import { SaDeleteDialogComponent } from './system-administration/sa-delete-dialog.component';
import { SaProjectsComponent } from './system-administration/sa-projects.component';
import { SaUsersComponent } from './system-administration/sa-users.component';
import { SystemAdministrationComponent } from './system-administration/system-administration.component';
import { UICommonModule } from './ui-common.module';
import { WriteStatusComponent } from './write-status/write-status.component';

const componentExports = [
  AvatarComponent,
  EditNameDialogComponent,
  ErrorComponent,
  SaProjectsComponent,
  SaDeleteDialogComponent,
  SaUsersComponent,
  SystemAdministrationComponent,
  WriteStatusComponent
];

export const xForgeCommonEntryComponents = [EditNameDialogComponent, SaDeleteDialogComponent];

@NgModule({
  imports: [
    // AvatarModule included here rather than `ui-common.module.ts` so unit tests don't access the internet
    AvatarModule,
    CommonModule,
    ngfModule,
    RouterModule,
    UICommonModule
  ],
  declarations: componentExports,
  exports: componentExports,
  entryComponents: [ErrorComponent],
  providers: [
    { provide: HTTP_INTERCEPTORS, useClass: AuthHttpInterceptor, multi: true },
    { provide: RealtimeRemoteStore, useExisting: SharedbRealtimeRemoteStore },
    { provide: RealtimeOfflineStore, useExisting: IndexeddbRealtimeOfflineStore }
  ]
})
export class XForgeCommonModule {}
