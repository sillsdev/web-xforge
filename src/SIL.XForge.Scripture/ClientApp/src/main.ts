import { OverlayContainer } from '@angular/cdk/overlay';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import {
  APP_ID,
  enableProdMode,
  ErrorHandler,
  importProvidersFrom,
  inject,
  provideAppInitializer
} from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter, withRouterConfig } from '@angular/router';
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
import { ExceptionHandlingService } from 'xforge-common/exception-handling.service';
import { EmTextTranspiler } from 'xforge-common/i18n-transpilers/em-text.transpiler';
import { InAppRootOverlayContainer } from 'xforge-common/overlay-container';
import { ProjectService } from 'xforge-common/project.service';
import { TypeRegistry } from 'xforge-common/type-registry';
import { provideUICommon } from 'xforge-common/ui-common-providers';
import { provideXForgeCommon } from 'xforge-common/xforge-common-providers';
import { AppComponent } from './app/app.component';
import { APP_ROUTES } from './app/app.routes';
import { SF_TYPE_REGISTRY } from './app/core/models/sf-type-registry';
import { SFProjectService } from './app/core/sf-project.service';
import { provideCustomIcons } from './app/shared/custom-icons';
import { provideSFTabs } from './app/shared/sf-tab-group';
import { provideQuillRegistrations } from './app/shared/text/quill-editor-registration/quill-providers';
import { preloadEnglishTranslations } from './app/shared/utils';
import { provideLynxInsights } from './app/translate/editor/lynx/insights/lynx-insights-providers';
import { environment } from './environments/environment';

export function getBaseUrl(): string {
  return document.getElementsByTagName('base')[0].href;
}

if (environment.production || environment.pwaTest) {
  enableProdMode();
}

ExceptionHandlingService.initBugsnag();

// The browser may snapshot a page into the back/forward cache when navigating away (Chrome 149+
// does this even while the realtime WebSocket is open), and pressing Back restores the snapshot —
// including auth state and user data that logging out was meant to destroy (SF-3855). No browser
// API can prevent or destroy the snapshot (the browser evicts it after a bounded time), so make
// restoring it a dead end: reload, so authentication is re-evaluated from scratch.
window.addEventListener('pageshow', (event: PageTransitionEvent) => {
  if (event.persisted) {
    window.location.reload();
  }
});

bootstrapApplication(AppComponent, {
  providers: [
    { provide: 'BASE_URL', useFactory: getBaseUrl, deps: [] as any[] },
    { provide: TypeRegistry, useValue: SF_TYPE_REGISTRY },
    { provide: ProjectService, useExisting: SFProjectService },
    provideCustomIcons(),
    provideSFTabs(),
    provideQuillRegistrations(),
    provideLynxInsights(),
    provideXForgeCommon(),
    provideRouter(
      APP_ROUTES,
      withRouterConfig({
        // This setting was introduced to prevent canceling the "prompt on leave" dialog for pages like draft-usfm-format
        // from mangling the browser history (SF-3577).
        canceledNavigationResolution: 'computed'
      })
    ),
    importProvidersFrom(
      ServiceWorkerModule.register('sf-service-worker.js', {
        enabled: environment.pwaTest || environment.production,
        registrationStrategy: 'registerImmediately'
      }),
      TranslocoModule,
      TranslocoMarkupModule,
      QuillModule.forRoot()
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
