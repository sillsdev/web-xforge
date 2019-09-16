import { DatePipe } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { ErrorHandler, NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ServiceWorkerModule } from '@angular/service-worker';
import bugsnag, { Bugsnag } from '@bugsnag/js';
import { ExceptionHandlingService } from 'xforge-common/exception-handling-service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { xForgeCommonEntryComponents, XForgeCommonModule } from 'xforge-common/xforge-common.module';
import { version } from '../../../version.json';
import { environment } from '../environments/environment';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { CheckingModule } from './checking/checking.module';
import { ConnectProjectComponent } from './connect-project/connect-project.component';
import { CoreModule } from './core/core.module';
import { ProjectDeletedDialogComponent } from './project-deleted-dialog/project-deleted-dialog.component';
import { ProjectComponent } from './project/project.component';
import { ScriptureChooserDialogComponent } from './scripture-chooser-dialog/scripture-chooser-dialog.component';
import { DeleteProjectDialogComponent } from './settings/delete-project-dialog/delete-project-dialog.component';
import { SettingsComponent } from './settings/settings.component';
import { StartComponent } from './start/start.component';
import { SyncComponent } from './sync/sync.component';
import { TranslateModule } from './translate/translate.module';
import { UsersModule } from './users/users.module';

function createBugsnagClient(): Bugsnag.Client {
  const config: Bugsnag.IConfig = {
    apiKey: environment.bugsnagApiKey,
    appVersion: version,
    appType: 'angular',
    notifyReleaseStages: ['live', 'qa'],
    releaseStage: environment.releaseStage,
    autoNotify: false,
    trackInlineScripts: false
  };
  if (environment.releaseStage === 'dev') {
    config.logger = null;
  }
  return bugsnag(config);
}

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
    ScriptureChooserDialogComponent
  ],
  imports: [
    AppRoutingModule,
    BrowserModule.withServerTransition({ appId: 'ng-cli-universal' }),
    BrowserAnimationsModule,
    CoreModule,
    HttpClientModule,
    // not ready for production yet - 2018-11 IJH
    ServiceWorkerModule.register('ngsw-worker.js', { enabled: environment.pwaTest }), // || environment.production }),
    TranslateModule,
    CheckingModule,
    UsersModule,
    UICommonModule,
    XForgeCommonModule
  ],
  providers: [
    DatePipe,
    { provide: ErrorHandler, useExisting: ExceptionHandlingService },
    { provide: Bugsnag.Client, useFactory: createBugsnagClient }
  ],
  entryComponents: [
    DeleteProjectDialogComponent,
    ProjectDeletedDialogComponent,
    ScriptureChooserDialogComponent,
    ...xForgeCommonEntryComponents
  ],
  bootstrap: [AppComponent]
})
export class AppModule {}
