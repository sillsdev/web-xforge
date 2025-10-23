import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import {
  EnvironmentProviders,
  importProvidersFrom,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer
} from '@angular/core';
import { TRANSLOCO_CONFIG, TRANSLOCO_LOADER, TranslocoConfig, TranslocoModule } from '@ngneat/transloco';
import { DecoratorFunction } from '@storybook/types';
import { I18nService, IGNORE_COOKIE_LOCALE, TranslationLoader } from './i18n.service';

let i18nService: I18nService | undefined;
let selectedLocale: string | undefined;

const translocoConfig: TranslocoConfig = { ...I18nService.translocoConfig, prodMode: false };

export const I18nStoryDecorator: DecoratorFunction = (Story, context) => {
  // In some cases the locale has been known to be the empty string, so make sure not to set it to that.
  const locale = context.parameters.locale || context.globals.locale || I18nService.defaultLocale.canonicalTag;
  selectedLocale = locale;
  if (i18nService != null) i18nService.trySetLocale(locale);
  return Story();
};

export function provideI18nStory(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideAppInitializer(() => {
      i18nService = inject(I18nService);
      if (selectedLocale != null) {
        i18nService.trySetLocale(selectedLocale);
      }
    }),
    importProvidersFrom(TranslocoModule),
    { provide: TRANSLOCO_CONFIG, useValue: translocoConfig },
    { provide: TRANSLOCO_LOADER, useClass: TranslationLoader },
    { provide: IGNORE_COOKIE_LOCALE, useValue: true },
    provideHttpClient(withInterceptorsFromDi())
  ]);
}
