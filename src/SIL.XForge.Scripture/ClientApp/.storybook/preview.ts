import { OverlayContainer } from '@angular/cdk/overlay';
import { importProvidersFrom } from '@angular/core';
import { getTestBed } from '@angular/core/testing';
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing';
import { provideAnimations } from '@angular/platform-browser/animations';
import { setCompodocJson } from '@storybook/addon-docs/angular';
import { applicationConfig } from '@storybook/angular';
import docJson from '../documentation.json';
import { I18nStoryDecorator, I18nStoryModule } from '../src/xforge-common/i18n-story.module';
import { I18nService } from '../src/xforge-common/i18n.service';
import { APP_ROOT_ELEMENT_SELECTOR, InAppRootOverlayContainer } from '../src/xforge-common/overlay-container';
import { getI18nLocales } from '../src/xforge-common/utils';

setCompodocJson(docJson);

export const parameters = {
  actions: { argTypesRegex: '^on[A-Z].*' },
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/
    }
  }
};

export const globalTypes = {
  locale: {
    description: 'Set active language',
    defaultValue: I18nService.defaultLocale.canonicalTag,
    toolbar: {
      icon: 'globe',
      dynamicTitle: true,
      items: getI18nLocales().map(locale => ({
        title: locale.englishName,
        value: locale.canonicalTag
      }))
    }
  }
};

export const decorators = [
  I18nStoryDecorator,
  applicationConfig({
    providers: [
      importProvidersFrom(I18nStoryModule),
      provideAnimations(),
      { provide: APP_ROOT_ELEMENT_SELECTOR, useValue: 'storybook-root' },
      { provide: OverlayContainer, useClass: InAppRootOverlayContainer }
    ]
  }),
  storyFn => {
    document.body.classList.add('theme-light');
    return storyFn();
  }
];

getTestBed().initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());
export const tags = ['autodocs'];
