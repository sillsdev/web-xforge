import { CommonModule } from '@angular/common';
import { Injector } from '@angular/core';
import { Translation, TranslocoService } from '@ngneat/transloco';
import { Decorator, Meta, moduleMetadata, StoryContext, StoryFn, StoryObj } from '@storybook/angular';
import { I18nStoryModule, I18nStoryDecorator as OriginalI18nStoryDecorator } from 'xforge-common/i18n-story.module';
import { I18nService } from 'xforge-common/i18n.service';
import { LtrMarkerInterceptor } from './ltr-marker.interceptor';

const AdaptedI18nStoryDecorator: Decorator = (story: StoryFn, context: StoryContext) => {
  return (OriginalI18nStoryDecorator as any)(story, context);
};

const createMockTranslocoService = (englishTranslations: Translation): TranslocoService => {
  return {
    getTranslation: (lang: string): Translation | undefined => {
      if (lang === 'en') {
        return englishTranslations;
      }
      return undefined;
    }
  } as TranslocoService;
};

const meta: Meta = {
  title: 'App/Transloco/LtrMarkers',
  decorators: [
    moduleMetadata({
      imports: [CommonModule, I18nStoryModule]
    }),
    AdaptedI18nStoryDecorator
  ],
  argTypes: {
    englishTranslations: {
      control: 'object',
      description: 'English translations (key-value pairs).'
    },
    rtlTranslations: {
      control: 'object',
      description: 'RTL translations (key-value pairs) to be processed.'
    }
  },
  render: (args, { globals }) => {
    const { englishTranslations, rtlTranslations } = args;

    const langToProcess = globals.locale || I18nService.defaultLocale.canonicalTag;
    const localeInfo = I18nService.getLocale(langToProcess);
    const isRtlByI18nService = localeInfo?.direction === 'rtl';

    const mockTransloco = createMockTranslocoService(englishTranslations as Translation);
    const injector = Injector.create({
      providers: [{ provide: TranslocoService, useValue: mockTransloco }]
    });

    const interceptor = new LtrMarkerInterceptor(injector);
    const modifiedTranslations = interceptor.preSaveTranslation(rtlTranslations as Translation, langToProcess);

    return {
      template: `
        <div style="font-family: sans-serif; padding: 20px; max-width: 800px; margin: auto;" dir="ltr">
          <h2>LTR Marker Interceptor</h2>
          <p>The <code>I18nStoryDecorator</code> has set the global UI locale for this story to:
            <strong>{{ storyLocale }}</strong>
          </p>
          <p>RTL: <strong>{{ isRtlServiceCheck }}</strong>
          </p>
          <hr>

          <h3>English</h3>
          <details>
            <summary>View English JSON</summary>
            <div style="background-color: #f0f0f0; padding: 10px; border-radius: 4px;">
              <dl style="margin: 0;">
                <ng-container *ngFor="let item of englishTranslationsObject | keyvalue">
                  <div style="margin-bottom: 4px;">
                    <dt style="font-weight: bold; display: inline;">{{ item.key }}:&nbsp;</dt>
                    <dd style="display: inline; margin-left: 0;">{{ item.value }}</dd>
                  </div>
                </ng-container>
              </dl>
            </div>
          </details>

          <h3>Original Translations</h3>
          <details>
            <summary>View Input RTL JSON</summary>
            <div style="background-color: #f0f0f0; padding: 10px; border-radius: 4px;">
              <dl style="margin: 0;">
                <ng-container *ngFor="let item of rtlTranslationsObject | keyvalue">
                  <div style="margin-bottom: 4px;">
                    <dt style="font-weight: bold; display: inline;">{{ item.key }}:&nbsp;</dt>
                    <dd style="display: inline; margin-left: 0;" [attr.dir]="isRtlServiceCheck ? 'rtl' : 'ltr'">{{ item.value }}</dd>
                  </div>
                </ng-container>
              </dl>
            </div>
          </details>

          <h3>Processed Translations</h3>
          <details open>
            <summary>View Processed RTL JSON</summary>
            <div style="background-color: #e6ffe6; padding: 10px; border-radius: 4px;">
              <dl style="margin: 0;">
                <ng-container *ngFor="let item of processedTranslationsObject | keyvalue">
                  <div style="margin-bottom: 4px;">
                    <dt style="font-weight: bold; display: inline;">{{ item.key }}:&nbsp;</dt>
                    <dd style="display: inline; margin-left: 0;" [attr.dir]="isRtlServiceCheck ? 'rtl' : 'ltr'">{{ item.value }}</dd>
                  </div>
                </ng-container>
              </dl>
            </div>
          </details>
          <br>
        </div>
      `,
      props: {
        storyLocale: langToProcess,
        isRtlServiceCheck: isRtlByI18nService,
        englishTranslationsObject: englishTranslations,
        rtlTranslationsObject: rtlTranslations,
        processedTranslationsObject: modifiedTranslations
      }
    };
  }
};
export default meta;

type Story = StoryObj;

export const Default: Story = {
  args: {
    englishTranslations: {
      greeting: 'Hello',
      untranslated_item: 'Untranslated',
      greeting_punct: 'Hello, world!',
      question_punct: 'How are you today?'
    },
    rtlTranslations: {
      greeting: 'مرحبا',
      untranslated_item: 'Untranslated', // Same as English, should be wrapped
      greeting_punct: 'مرحبا بالعالم!', // Different from English
      question_punct: 'How are you today?' // Same as English, should be wrapped
    }
  },
  parameters: {
    locale: 'ar'
  }
};
