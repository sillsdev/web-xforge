import { DatePipe } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { ErrorHandler, NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ServiceWorkerModule } from '@angular/service-worker';
import { TranslocoModule } from '@ngneat/transloco';
import { CookieService } from 'ngx-cookie-service';
import { EditNameDialogComponent } from 'xforge-common/edit-name-dialog/edit-name-dialog.component';
import { ErrorComponent } from 'xforge-common/error/error.component';
import { ExceptionHandlingService } from 'xforge-common/exception-handling-service';
import { SupportedBrowsersDialogComponent } from 'xforge-common/supported-browsers-dialog/supported-browsers-dialog.component';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { XForgeCommonModule } from 'xforge-common/xforge-common.module';
import { FeatureFlagsDialogComponent } from 'xforge-common/feature-flags/feature-flags.component';
import { environment } from '../environments/environment';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { CheckingModule } from './checking/checking.module';
import { ConnectProjectComponent } from './connect-project/connect-project.component';
import { CoreModule } from './core/core.module';
import { ProjectDeletedDialogComponent } from './project-deleted-dialog/project-deleted-dialog.component';
import { ProjectSelectComponent } from './project-select/project-select.component';
import { ProjectComponent } from './project/project.component';
import { ScriptureChooserDialogComponent } from './scripture-chooser-dialog/scripture-chooser-dialog.component';
import { DeleteProjectDialogComponent } from './settings/delete-project-dialog/delete-project-dialog.component';
import { SettingsComponent } from './settings/settings.component';
import { StartComponent } from './start/start.component';
import { SyncProgressComponent } from './sync/sync-progress/sync-progress.component';
import { SyncComponent } from './sync/sync.component';
import { TranslateModule } from './translate/translate.module';
import { UsersModule } from './users/users.module';
import { TextNoteDialogComponent } from './shared/text/text-note-dialog/text-note-dialog.component';

@NgModule({
  declarations: [
    AppComponent,
    ConnectProjectComponent,
    DeleteProjectDialogComponent,
    ProjectComponent,
    ProjectDeletedDialogComponent,
    SettingsComponent,
    StartComponent,
    SyncComponent,
    ScriptureChooserDialogComponent,
    SupportedBrowsersDialogComponent,
    ErrorComponent,
    EditNameDialogComponent,
    FeatureFlagsDialogComponent,
    ProjectSelectComponent,
    SyncProgressComponent,
    TextNoteDialogComponent
  ],
  imports: [
    BrowserModule.withServerTransition({ appId: 'ng-cli-universal' }),
    BrowserAnimationsModule,
    CoreModule,
    HttpClientModule,
    ServiceWorkerModule.register('sf-service-worker.js', {
      enabled: environment.pwaTest || environment.production,
      registrationStrategy: 'registerImmediately'
    }),
    TranslateModule,
    CheckingModule,
    UsersModule,
    UICommonModule,
    XForgeCommonModule,
    TranslocoModule,
    AppRoutingModule
  ],
  providers: [CookieService, DatePipe, { provide: ErrorHandler, useClass: ExceptionHandlingService }],
  bootstrap: [AppComponent]
})
export class AppModule {}
