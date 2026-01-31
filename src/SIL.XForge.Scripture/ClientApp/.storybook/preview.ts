import { OverlayContainer } from '@angular/cdk/overlay';
import { getTestBed } from '@angular/core/testing';
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing';
import { provideAnimations } from '@angular/platform-browser/animations';
import { setCompodocJson } from '@storybook/addon-docs/angular';
import { applicationConfig } from '@storybook/angular';
import { MINIMAL_VIEWPORTS } from 'storybook/viewport';
import { I18nStoryDecorator, provideI18nStory } from 'xforge-common/i18n-story';
import { I18nService } from 'xforge-common/i18n.service';
import { APP_ROOT_ELEMENT_SELECTOR, InAppRootOverlayContainer } from 'xforge-common/overlay-container';
import { Appearance, appearanceValues, ThemeService } from 'xforge-common/theme.service';
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
  },
  viewport: {
    options: MINIMAL_VIEWPORTS
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
  },
  appearance: {
    description: 'Set appearance theme',
    defaultValue: 'light',
    toolbar: {
      icon: 'paintbrush',
      dynamicTitle: true,
      items: [
        { title: '☀️ Light', value: 'light' },
        { title: '🌙 Dark', value: 'dark' },
        { title: '💻 Device', value: 'device' }
      ]
    }
  }
};

function isAppearance(value: unknown): value is Appearance {
  return appearanceValues.includes(value as any);
}

function getAppearanceFromGlobals(globals: Record<string, unknown>): Appearance {
  const appearance: unknown = globals['appearance'];
  if (isAppearance(appearance)) return appearance;
  return 'light';
}

function applyContentStyle(): void {
  const storybookAppShellStyleId = 'storybook-app-shell-style';
  const head: HTMLHeadElement | null = document.head;
  if (head == null) return;
  const existingStyle: HTMLElement | null = document.getElementById(storybookAppShellStyleId);
  if (existingStyle != null) return;

  const style: HTMLStyleElement = document.createElement('style');
  style.id = storybookAppShellStyleId;
  style.textContent = `
    html.theme-default {
    }

    html.theme-default-dark  {
      background: var(--mat-app-background-color);
    }
  `.trim();
  head.appendChild(style);
}

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
  (storyFn, context) => {
    const globals: Record<string, unknown> = context.globals as Record<string, unknown>;
    const appearance: Appearance = getAppearanceFromGlobals(globals);
    const themeService: ThemeService = getTestBed().inject(ThemeService);
    themeService.set(appearance);
    applyContentStyle();
    return storyFn();
  }
];

getTestBed().initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());
export const tags = ['autodocs'];
