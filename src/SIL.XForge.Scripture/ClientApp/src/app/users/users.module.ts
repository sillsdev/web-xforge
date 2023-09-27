import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { TranslocoModule } from '@ngneat/transloco';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { XForgeCommonModule } from 'xforge-common/xforge-common.module';
import { SharedModule } from '../shared/shared.module';
import { CollaboratorsComponent } from './collaborators/collaborators.component';
import { RolesAndPermissionsComponent } from './roles-and-permissions/roles-and-permissions.component';
import { UsersRoutingModule } from './users-routing.module';
import { UsersComponent } from './users.component';

@NgModule({
  declarations: [CollaboratorsComponent, UsersComponent, RolesAndPermissionsComponent],
  imports: [UsersRoutingModule, CommonModule, SharedModule, UICommonModule, XForgeCommonModule, TranslocoModule]
})
export class UsersModule {}
