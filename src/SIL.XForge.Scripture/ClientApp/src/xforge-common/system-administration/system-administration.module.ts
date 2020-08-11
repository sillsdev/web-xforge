import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { ngfModule } from 'angular-file';
import { SaDeleteDialogComponent } from 'xforge-common/system-administration/sa-delete-dialog.component';
import { SaProjectsComponent } from 'xforge-common/system-administration/sa-projects.component';
import { SaUsersComponent } from 'xforge-common/system-administration/sa-users.component';
import { SystemAdministrationRoutingModule } from 'xforge-common/system-administration/system-administration-routing.module';
import { SystemAdministrationComponent } from 'xforge-common/system-administration/system-administration.component';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { XForgeCommonModule } from 'xforge-common/xforge-common.module';

@NgModule({
  declarations: [SystemAdministrationComponent, SaUsersComponent, SaDeleteDialogComponent, SaProjectsComponent],
  imports: [
    CommonModule,
    ngfModule,
    RouterModule,
    XForgeCommonModule,
    UICommonModule,
    TranslocoModule,
    SystemAdministrationRoutingModule
  ],
  entryComponents: [SaDeleteDialogComponent]
})
export class SystemAdministrationModule {}
