import { CommonModule } from '@angular/common';
import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { NgModule } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import { RouterModule } from '@angular/router';
import { TranslocoModule, TRANSLOCO_CONFIG, TRANSLOCO_LOADER } from '@ngneat/transloco';
import { ngfModule } from 'angular-file';
import { AvatarModule } from 'ngx-avatar';
import { OwnerComponent } from 'xforge-common/owner/owner.component';
import { PageNotFoundComponent } from '../app/shared/page-not-found/page-not-found.component';
import { AuthHttpInterceptor } from './auth-http-interceptor';
import { AvatarComponent } from './avatar/avatar.component';
import { GenericDialogComponent } from './generic-dialog/generic-dialog.component';
import { I18nService, TranslationLoader } from './i18n.service';
import { IndexeddbOfflineStore } from './indexeddb-offline-store';
import { OfflineStore } from './offline-store';
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
  GenericDialogComponent,
  SaProjectsComponent,
  SaDeleteDialogComponent,
  SaUsersComponent,
  SystemAdministrationComponent,
  PageNotFoundComponent,
  WriteStatusComponent,
  OwnerComponent
];

@NgModule({
  imports: [
    // AvatarModule included here rather than `ui-common.module.ts` so unit tests don't access the internet
    AvatarModule,
    CommonModule,
    ngfModule,
    RouterModule,
    UICommonModule,
    TranslocoModule,
    MatDialogModule
  ],
  declarations: componentExports,
  exports: componentExports,
  providers: [
    { provide: HTTP_INTERCEPTORS, useClass: AuthHttpInterceptor, multi: true },
    { provide: RealtimeRemoteStore, useExisting: SharedbRealtimeRemoteStore },
    { provide: OfflineStore, useExisting: IndexeddbOfflineStore },
    { provide: TRANSLOCO_CONFIG, useValue: I18nService.translocoConfig },
    { provide: TRANSLOCO_LOADER, useClass: TranslationLoader }
  ]
})
export class XForgeCommonModule {}
