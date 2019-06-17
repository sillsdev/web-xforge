import { DatePipe } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { ErrorHandler, NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ServiceWorkerModule } from '@angular/service-worker';
import { ExceptionHandlingService } from 'xforge-common/exception-handling-service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { xForgeCommonEntryComponents, XForgeCommonModule } from 'xforge-common/xforge-common.module';
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
import { SharedModule } from './shared/shared.module';
import { StartComponent } from './start/start.component';
import { SyncComponent } from './sync/sync.component';
import { TranslateModule } from './translate/translate.module';
import initHelpHero from 'helphero';
import * as helphero from 'src/typings/help-hero';

export class HelpHeroService {
  static $inject: string[] = [];
  helpHeroClient: helphero.HelpHero;
  constructor() {
    this.helpHeroClient = initHelpHero('9yZMlWWMsDS');
  }
  setIdentity(id: string): void {
    this.helpHeroClient.identify(id);
  }
  setProperty(jObj: any): void {
    this.helpHeroClient.update(jObj);
  }
  startTour(tourId: string, options?: any) {
    this.helpHeroClient.startTour(tourId, options);
  }
  on(eventName: helphero.HEventKind, listenerFn: (event: helphero.HEvent, info: helphero.HEventInfo) => void) {
    this.helpHeroClient.on(eventName, listenerFn);
  }
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
    SharedModule,
    TranslateModule,
    CheckingModule,
    UICommonModule,
    XForgeCommonModule
  ],
  providers: [DatePipe, { provide: ErrorHandler, useClass: ExceptionHandlingService }],
  entryComponents: [
    DeleteProjectDialogComponent,
    ProjectDeletedDialogComponent,
    ScriptureChooserDialogComponent,
    ...xForgeCommonEntryComponents
  ],
  bootstrap: [AppComponent]
})
export class AppModule {}
