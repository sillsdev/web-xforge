import { DecoratorFunction } from '@storybook/csf';
import { HttpClientModule } from '@angular/common/http';
import { ApplicationRef, APP_INITIALIZER, NgModule } from '@angular/core';
import {
  TranslocoConfig,
  TranslocoModule,
  TranslocoService,
  TRANSLOCO_CONFIG,
  TRANSLOCO_LOADER
} from '@ngneat/transloco';
import { delay, distinctUntilChanged, tap } from 'rxjs/operators';
import { I18nService, IGNORE_COOKIE_LOCALE, TranslationLoader } from './i18n.service';

let translocoService: TranslocoService | undefined;
let selectedLocale: string | undefined;

const translocoConfig: TranslocoConfig = { ...I18nService.translocoConfig, prodMode: false };

function getLocaleDir(locale: string): 'ltr' | 'rtl' {
  return I18nService.locales.find(l => l.tags.some(tag => tag === locale))?.direction ?? 'ltr';
}

function localizationInit(transloco: TranslocoService, applicationRef: ApplicationRef): () => void {
  return () => {
    translocoService = transloco;

    transloco.langChanges$
      .pipe(
        distinctUntilChanged(),
        delay(100), // hideous but necessary
        tap(() => {
          document.body.setAttribute('dir', getLocaleDir(transloco.getActiveLang()));
          applicationRef.tick();
        })
      )
      .subscribe();

    if (selectedLocale != null) translocoService.setActiveLang(selectedLocale);
  };
}

export const I18nStoryDecorator: DecoratorFunction = (Story, context) => {
  // In some cases the locale has been known to be the empty string, so make sure not to set it to that.
  const locale = context.globals.locale || I18nService.defaultLocale.canonicalTag;
  selectedLocale = locale;
  if (translocoService != null) translocoService.setActiveLang(locale);
  return Story();
};

@NgModule({
  imports: [HttpClientModule],
  exports: [TranslocoModule],
  providers: [
    { provide: APP_INITIALIZER, useFactory: localizationInit, deps: [TranslocoService, ApplicationRef], multi: true },
    { provide: TRANSLOCO_CONFIG, useValue: translocoConfig },
    { provide: TRANSLOCO_LOADER, useClass: TranslationLoader },
    { provide: IGNORE_COOKIE_LOCALE, useValue: true }
  ]
})
export class I18nStoryModule {}
