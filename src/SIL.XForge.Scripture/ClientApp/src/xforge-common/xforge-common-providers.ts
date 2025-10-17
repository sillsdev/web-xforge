import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { TRANSLOCO_CONFIG, TRANSLOCO_INTERCEPTOR, TRANSLOCO_LOADER } from '@ngneat/transloco';
import { LtrMarkerInterceptor } from '../app/shared/ltr-marker.interceptor';
import { AuthHttpInterceptor } from './auth-http-interceptor';
import { I18nService, TranslationLoader } from './i18n.service';
import { IndexeddbOfflineStore } from './indexeddb-offline-store';
import { OfflineStore } from './offline-store';
import { RealtimeRemoteStore } from './realtime-remote-store';
import { SharedbRealtimeRemoteStore } from './sharedb-realtime-remote-store';

/**
 * Provides core xForge services including HTTP interceptors, realtime/offline stores, and i18n configuration.
 */
export function provideXForgeCommon(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: HTTP_INTERCEPTORS, useClass: AuthHttpInterceptor, multi: true },
    { provide: RealtimeRemoteStore, useExisting: SharedbRealtimeRemoteStore },
    { provide: OfflineStore, useExisting: IndexeddbOfflineStore },
    { provide: TRANSLOCO_CONFIG, useValue: I18nService.translocoConfig },
    { provide: TRANSLOCO_LOADER, useClass: TranslationLoader },
    { provide: TRANSLOCO_INTERCEPTOR, useClass: LtrMarkerInterceptor }
  ]);
}
