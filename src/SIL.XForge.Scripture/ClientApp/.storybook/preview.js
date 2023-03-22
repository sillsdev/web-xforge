import { setCompodocJson } from '@storybook/addon-docs/angular';
import { moduleMetadata } from '@storybook/angular';
import { I18nStoryModule, I18nStoryDecorator } from '../src/xforge-common/i18n-story.module';
import docJson from '../documentation.json';
import { getI18nLocales } from '../src/xforge-common/utils';
import { I18nService } from '../src/xforge-common/i18n.service';
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

export const decorators = [I18nStoryDecorator, moduleMetadata({ imports: [I18nStoryModule] })];
