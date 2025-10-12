import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { TranslocoModule } from '@ngneat/transloco';
import { AvatarComponent } from 'xforge-common/avatar/avatar.component';
import { XForgeCommonModule } from 'xforge-common/xforge-common.module';
import { SharedModule } from '../shared/shared.module';
import { CollaboratorsComponent } from './collaborators/collaborators.component';
import { RolesAndPermissionsDialogComponent } from './roles-and-permissions/roles-and-permissions-dialog.component';
import { UsersRoutingModule } from './users-routing.module';
import { UsersComponent } from './users.component';

@NgModule({
  imports: [
    UsersRoutingModule,
    CommonModule,
    SharedModule,
    XForgeCommonModule,
    TranslocoModule,
    AvatarComponent,
    CollaboratorsComponent,
    UsersComponent,
    RolesAndPermissionsDialogComponent
  ]
})
export class UsersModule {}
