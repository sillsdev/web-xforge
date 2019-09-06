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
import { ShareControlComponent } from './share/share-control.component';
import { ShareDialogComponent } from './share/share-dialog.component';
import { ShareComponent } from './share/share.component';
import { SaDeleteDialogComponent } from './system-administration/sa-delete-dialog.component';
import { SaProjectsComponent } from './system-administration/sa-projects.component';
import { SaUsersComponent } from './system-administration/sa-users.component';
import { SystemAdministrationComponent } from './system-administration/system-administration.component';
import { UICommonModule } from './ui-common.module';
import { CollaboratorsComponent } from './users/collaborators/collaborators.component';
import { UsersComponent } from './users/users.component';
import { WriteStatusComponent } from './write-status/write-status.component';

const componentExports = [
  AvatarComponent,
  CollaboratorsComponent,
  EditNameDialogComponent,
  ErrorComponent,
  SaProjectsComponent,
  SaDeleteDialogComponent,
  SaUsersComponent,
  ShareComponent,
  ShareControlComponent,
  ShareDialogComponent,
  SystemAdministrationComponent,
  UsersComponent,
  WriteStatusComponent
];

export const xForgeCommonEntryComponents = [EditNameDialogComponent, ShareDialogComponent, SaDeleteDialogComponent];

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
  providers: [{ provide: HTTP_INTERCEPTORS, useClass: AuthHttpInterceptor, multi: true }]
})
export class XForgeCommonModule {}
