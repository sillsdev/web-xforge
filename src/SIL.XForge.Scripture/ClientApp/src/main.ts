import {
  APP_ID,
  enableProdMode,
  ErrorHandler,
  importProvidersFrom,
  inject,
  provideAppInitializer
} from '@angular/core';

import { ExceptionHandlingService } from 'xforge-common/exception-handling.service';

import { OverlayContainer } from '@angular/cdk/overlay';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
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
import { EmTextTranspiler } from 'xforge-common/i18n-transpilers/em-text.transpiler';
import { InAppRootOverlayContainer } from 'xforge-common/overlay-container';
import { ProjectService } from 'xforge-common/project.service';
import { TypeRegistry } from 'xforge-common/type-registry';
import { provideUICommon } from 'xforge-common/ui-common-providers';
import { XForgeCommonModule } from 'xforge-common/xforge-common.module';
import { AppRoutingModule } from './app/app-routing.module';
import { AppComponent } from './app/app.component';
import { CheckingModule } from './app/checking/checking.module';
import { SF_TYPE_REGISTRY } from './app/core/models/sf-type-registry';
import { SFProjectService } from './app/core/sf-project.service';
import { SharedModule } from './app/shared/shared.module';
import { preloadEnglishTranslations } from './app/shared/utils';
import { LynxInsightsModule } from './app/translate/editor/lynx/insights/lynx-insights.module';
import { TranslateModule } from './app/translate/translate.module';
import { UsersModule } from './app/users/users.module';
import { environment } from './environments/environment';

export function getBaseUrl(): string {
  return document.getElementsByTagName('base')[0].href;
}

if (environment.production || environment.pwaTest) {
  enableProdMode();
}

ExceptionHandlingService.initBugsnag();

bootstrapApplication(AppComponent, {
  providers: [
    { provide: 'BASE_URL', useFactory: getBaseUrl, deps: [] as any[] },
    { provide: TypeRegistry, useValue: SF_TYPE_REGISTRY },
    { provide: ProjectService, useExisting: SFProjectService },
    importProvidersFrom(
      ServiceWorkerModule.register('sf-service-worker.js', {
        enabled: environment.pwaTest || environment.production,
        registrationStrategy: 'registerImmediately'
      }),
      TranslateModule,
      CheckingModule,
      UsersModule,
      XForgeCommonModule,
      TranslocoModule,
      TranslocoMarkupModule,
      AppRoutingModule,
      SharedModule.forRoot(),
      QuillModule.forRoot(),
      LynxInsightsModule.forRoot()
    ),
    { provide: APP_ID, useValue: 'ng-cli-universal' },
    CookieService,
    provideAnimations(),
    provideUICommon(),
    provideTranslationMarkupTranspiler(EmTextTranspiler),
    translocoMarkupRouterLinkRenderer(),
    defaultTranslocoMarkupTranspilers(),
    { provide: ErrorHandler, useClass: ExceptionHandlingService },
    { provide: OverlayContainer, useClass: InAppRootOverlayContainer },
    provideHttpClient(withInterceptorsFromDi()),
    provideAppInitializer(() => {
      const initializerFn = preloadEnglishTranslations(inject(TranslocoService));
      return initializerFn();
    })
  ]
}).catch(err => console.log(err));
