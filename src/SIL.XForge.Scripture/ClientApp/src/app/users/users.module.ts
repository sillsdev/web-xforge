import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { TranslocoModule } from '@ngneat/transloco';
import { AvatarComponent } from 'xforge-common/avatar/avatar.component';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { XForgeCommonModule } from 'xforge-common/xforge-common.module';
import { SharedModule } from '../shared/shared.module';
import { CollaboratorsComponent } from './collaborators/collaborators.component';
import { RolesAndPermissionsDialogComponent } from './roles-and-permissions/roles-and-permissions-dialog.component';
import { UsersRoutingModule } from './users-routing.module';
import { UsersComponent } from './users.component';

@NgModule({
  declarations: [CollaboratorsComponent, UsersComponent, RolesAndPermissionsDialogComponent],
  imports: [
    UsersRoutingModule,
    CommonModule,
    SharedModule,
    UICommonModule,
    XForgeCommonModule,
    TranslocoModule,
    AvatarComponent
  ]
})
export class UsersModule {}
