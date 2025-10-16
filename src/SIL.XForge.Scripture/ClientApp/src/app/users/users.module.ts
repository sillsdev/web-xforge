import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { TranslocoModule } from '@ngneat/transloco';
import { AvatarComponent } from 'xforge-common/avatar/avatar.component';
import { XForgeCommonModule } from 'xforge-common/xforge-common.module';
import { ShareControlComponent } from '../shared/share/share-control.component';
import { CollaboratorsComponent } from './collaborators/collaborators.component';
import { RolesAndPermissionsDialogComponent } from './roles-and-permissions/roles-and-permissions-dialog.component';
import { UsersRoutingModule } from './users-routing.module';
import { UsersComponent } from './users.component';

@NgModule({
  imports: [
    UsersRoutingModule,
    CommonModule,
    XForgeCommonModule,
    TranslocoModule,
    AvatarComponent,
    ShareControlComponent,
    CollaboratorsComponent,
    UsersComponent,
    RolesAndPermissionsDialogComponent
  ]
})
export class UsersModule {}
