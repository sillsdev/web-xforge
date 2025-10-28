import { OverlayContainer } from '@angular/cdk/overlay';
import { getTestBed } from '@angular/core/testing';
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing';
import { provideAnimations } from '@angular/platform-browser/animations';
import { setCompodocJson } from '@storybook/addon-docs/angular';
import { applicationConfig } from '@storybook/angular';
import { I18nStoryDecorator, provideI18nStory } from 'xforge-common/i18n-story';
import { I18nService } from 'xforge-common/i18n.service';
import { APP_ROOT_ELEMENT_SELECTOR, InAppRootOverlayContainer } from 'xforge-common/overlay-container';
import { provideUICommon } from 'xforge-common/ui-common-providers';
import { getI18nLocales } from 'xforge-common/utils';
import docJson from '../documentation.json';
import { provideSFTabs } from '../src/app/shared/sf-tab-group';

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
      provideI18nStory(),
      provideAnimations(),
      provideUICommon(),
      provideSFTabs(),
      { provide: APP_ROOT_ELEMENT_SELECTOR, useValue: 'storybook-root' },
      { provide: OverlayContainer, useClass: InAppRootOverlayContainer }
    ]
  }),
  storyFn => {
    document.documentElement.classList.add('theme-default');
    return storyFn();
  }
];

getTestBed().initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());
export const tags = ['autodocs'];
