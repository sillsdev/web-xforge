import { OverlayContainer } from '@angular/cdk/overlay';
import { DatePipe } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { ErrorHandler, NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ServiceWorkerModule } from '@angular/service-worker';
import { TranslocoModule } from '@ngneat/transloco';
import { CookieService } from 'ngx-cookie-service';
import { defaultTranslocoMarkupTranspilers, provideTranslationMarkupTranspiler } from 'ngx-transloco-markup';
import { translocoMarkupRouterLinkRenderer } from 'ngx-transloco-markup-router-link';
import { AvatarComponent } from 'xforge-common/avatar/avatar.component';
import { EditNameDialogComponent } from 'xforge-common/edit-name-dialog/edit-name-dialog.component';
import { ErrorDialogComponent } from 'xforge-common/error-dialog/error-dialog.component';
import { ExceptionHandlingService } from 'xforge-common/exception-handling-service';
import { FeatureFlagsDialogComponent } from 'xforge-common/feature-flags/feature-flags-dialog.component';
import { EmTextTranspiler } from 'xforge-common/i18n-transpilers/em-text.transpiler';
import { InAppRootOverlayContainer } from 'xforge-common/overlay-container';
import { SupportedBrowsersDialogComponent } from 'xforge-common/supported-browsers-dialog/supported-browsers-dialog.component';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { XForgeCommonModule } from 'xforge-common/xforge-common.module';
import { environment } from '../environments/environment';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { CheckingModule } from './checking/checking.module';
import { ConnectProjectComponent } from './connect-project/connect-project.component';
import { CoreModule } from './core/core.module';
import { JoinComponent } from './join/join.component';
import { NavigationProjectSelectorComponent } from './navigation-project-selector/navigation-project-selector.component';
import { NavigationComponent } from './navigation/navigation.component';
import { ProjectComponent } from './project/project.component';
import { ScriptureChooserDialogComponent } from './scripture-chooser-dialog/scripture-chooser-dialog.component';
import { DeleteProjectDialogComponent } from './settings/delete-project-dialog/delete-project-dialog.component';
import { SettingsComponent } from './settings/settings.component';
import { SharedModule } from './shared/shared.module';
import { TextNoteDialogComponent } from './shared/text/text-note-dialog/text-note-dialog.component';
import { StartComponent } from './start/start.component';
import { SyncComponent } from './sync/sync.component';
import { TranslateModule } from './translate/translate.module';
import { UsersModule } from './users/users.module';

@NgModule({
  declarations: [
    AppComponent,
    NavigationComponent,
    ConnectProjectComponent,
    DeleteProjectDialogComponent,
    ProjectComponent,
    SettingsComponent,
    StartComponent,
    SyncComponent,
    ScriptureChooserDialogComponent,
    SupportedBrowsersDialogComponent,
    ErrorDialogComponent,
    EditNameDialogComponent,
    FeatureFlagsDialogComponent,
    TextNoteDialogComponent,
    JoinComponent
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
    UICommonModule.forRoot(),
    XForgeCommonModule,
    TranslocoModule,
    AppRoutingModule,
    SharedModule,
    NavigationProjectSelectorComponent,
    AvatarComponent
  ],
  providers: [
    CookieService,
    DatePipe,
    provideTranslationMarkupTranspiler(EmTextTranspiler),
    translocoMarkupRouterLinkRenderer(),
    defaultTranslocoMarkupTranspilers(),
    { provide: ErrorHandler, useClass: ExceptionHandlingService },
    { provide: OverlayContainer, useClass: InAppRootOverlayContainer }
  ],
  bootstrap: [AppComponent]
})
export class AppModule {}
