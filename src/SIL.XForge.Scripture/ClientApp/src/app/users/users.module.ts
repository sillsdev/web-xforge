import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { TranslocoModule } from '@ngneat/transloco';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { XForgeCommonModule } from 'xforge-common/xforge-common.module';
import { SharedModule } from '../shared/shared.module';
import { CollaboratorsComponent } from './collaborators/collaborators.component';
import { UsersRoutingModule } from './users-routing.module';
import { UsersComponent } from './users.component';

@NgModule({
  declarations: [CollaboratorsComponent, UsersComponent],
  imports: [UsersRoutingModule, CommonModule, SharedModule, UICommonModule, XForgeCommonModule, TranslocoModule]
})
export class UsersModule {}
