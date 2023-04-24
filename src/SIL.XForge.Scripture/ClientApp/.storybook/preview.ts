import { applicationConfig } from '@storybook/angular';
import { getI18nLocales } from '../src/xforge-common/utils';
import { I18nService } from '../src/xforge-common/i18n.service';
import { I18nStoryModule, I18nStoryDecorator } from '../src/xforge-common/i18n-story.module';
import { importProvidersFrom } from '@angular/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { setCompodocJson } from '@storybook/addon-docs/angular';
import docJson from '../documentation.json';
setCompodocJson(docJson);

export const parameters = {
  actions: { argTypesRegex: '^on[A-Z].*' },
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/
    }
  },
  docs: { inlineStories: true }
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
    providers: [importProvidersFrom(I18nStoryModule), provideAnimations()]
  })
];
