import { CommonModule } from '@angular/common';
import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { NgModule } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import { RouterModule } from '@angular/router';
import { TRANSLOCO_CONFIG, TRANSLOCO_LOADER, TranslocoModule } from '@ngneat/transloco';
import { ngfModule } from 'angular-file';
import { OwnerComponent } from 'xforge-common/owner/owner.component';
import { ProjectSelectComponent } from '../app/project-select/project-select.component';
import { PageNotFoundComponent } from '../app/shared/page-not-found/page-not-found.component';
import { SyncProgressComponent } from '../app/sync/sync-progress/sync-progress.component';
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
import { SaHelpVideosComponent } from './system-administration/sa-help-video-tab/sa-help-videos.component';

const componentExports = [
  GenericDialogComponent,
  SaProjectsComponent,
  SaDeleteDialogComponent,
  SaUsersComponent,
  SystemAdministrationComponent,
  PageNotFoundComponent,
  WriteStatusComponent,
  OwnerComponent,
  ProjectSelectComponent,
  SyncProgressComponent,
  SaHelpVideosComponent
];

@NgModule({
  imports: [CommonModule, ngfModule, RouterModule, UICommonModule, TranslocoModule, MatDialogModule, AvatarComponent],
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
