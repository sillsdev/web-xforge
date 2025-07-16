import { OverlayContainer } from '@angular/cdk/overlay';
import { DatePipe } from '@angular/common';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { APP_ID, ErrorHandler, NgModule, inject, provideAppInitializer } from '@angular/core';
import { MatRipple } from '@angular/material/core';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ServiceWorkerModule } from '@angular/service-worker';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import { CookieService } from 'ngx-cookie-service';
import { QuillModule } from 'ngx-quill';
import {
  defaultTranslocoMarkupTranspilers,
  provideTranslationMarkupTranspiler,
  TranslocoMarkupModule
} from 'ngx-transloco-markup';
import { translocoMarkupRouterLinkRenderer } from 'ngx-transloco-markup-router-link';
import { AvatarComponent } from 'xforge-common/avatar/avatar.component';
import { EditNameDialogComponent } from 'xforge-common/edit-name-dialog/edit-name-dialog.component';
import { ErrorDialogComponent } from 'xforge-common/error-dialog/error-dialog.component';
import { ExceptionHandlingService } from 'xforge-common/exception-handling.service';
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
import { MyProjectsComponent } from './my-projects/my-projects.component';
import { NavigationComponent } from './navigation/navigation.component';
import { ProjectComponent } from './project/project.component';
import { ScriptureChooserDialogComponent } from './scripture-chooser-dialog/scripture-chooser-dialog.component';
import { DeleteProjectDialogComponent } from './settings/delete-project-dialog/delete-project-dialog.component';
import { SettingsComponent } from './settings/settings.component';
import { GlobalNoticesComponent } from './shared/global-notices/global-notices.component';
import { SharedModule } from './shared/shared.module';
import { TextNoteDialogComponent } from './shared/text/text-note-dialog/text-note-dialog.component';
import { preloadEnglishTranslations } from './shared/utils';
import { SyncComponent } from './sync/sync.component';
import { LynxInsightsModule } from './translate/editor/lynx/insights/lynx-insights.module';
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
    MyProjectsComponent,
    SyncComponent,
    ScriptureChooserDialogComponent,
    SupportedBrowsersDialogComponent,
    ErrorDialogComponent,
    EditNameDialogComponent,
    FeatureFlagsDialogComponent,
    TextNoteDialogComponent,
    JoinComponent
  ],
  bootstrap: [AppComponent],
  imports: [
    BrowserAnimationsModule,
    CoreModule,
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
    TranslocoMarkupModule,
    AppRoutingModule,
    SharedModule.forRoot(),
    AvatarComponent,
    MatRipple,
    GlobalNoticesComponent,
    QuillModule.forRoot(),
    LynxInsightsModule.forRoot()
  ],
  providers: [
    { provide: APP_ID, useValue: 'ng-cli-universal' },
    CookieService,
    DatePipe,
    provideTranslationMarkupTranspiler(EmTextTranspiler),
    translocoMarkupRouterLinkRenderer(),
    defaultTranslocoMarkupTranspilers(),
    { provide: ErrorHandler, useClass: ExceptionHandlingService },
    { provide: OverlayContainer, useClass: InAppRootOverlayContainer },
    provideHttpClient(withInterceptorsFromDi()),
    provideAppInitializer(() => {
        const initializerFn = (preloadEnglishTranslations)(inject(TranslocoService));
        return initializerFn();
      })
  ]
})
export class AppModule {}
