import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Translation, TranslocoService } from '@ngneat/transloco';
import { LtrMarkerInterceptor } from './ltr-marker.interceptor';
import { LEFT_TO_RIGHT_EMBEDDING, POP_DIRECTIONAL_FORMATTING } from './utils';

describe('LtrMarkerInterceptor', () => {
  let interceptor: LtrMarkerInterceptor;
  let mockInjector: Injector;
  let mockTranslocoService: Partial<TranslocoService>;

  const englishTranslations: Translation = {
    'any.Hello': 'Hello',
    item123: 'Item 123',
    testPunctuation: 'Value is $50'
  };

  beforeEach(() => {
    mockTranslocoService = {
      getTranslation: jasmine.createSpy('getTranslation').and.callFake((langOrScope?: string) => {
        if (langOrScope === 'en') {
          return englishTranslations;
        }
        return {};
      })
    };

    mockInjector = {
      get: jasmine.createSpy('get').and.callFake((_: any) => {
        return mockTranslocoService as TranslocoService;
      })
    } as Injector;

    TestBed.configureTestingModule({
      providers: [LtrMarkerInterceptor, { provide: Injector, useValue: mockInjector }]
    });
    interceptor = TestBed.inject(LtrMarkerInterceptor);
  });

  describe('Interceptor Behavior', () => {
    describe('preSaveTranslation', () => {
      it('ar should wrap LTR', () => {
        const translations: Translation = {
          engOnly: 'Hello',
          arabicText: 'مرحبا',
          mixedText: 'Hello مرحبا',
          interpolation: 'Value: {{val}}',
          alreadyWrapped: `${LEFT_TO_RIGHT_EMBEDDING}Wrapped${POP_DIRECTIONAL_FORMATTING}`
        };
        const expected: Translation = {
          engOnly: `${LEFT_TO_RIGHT_EMBEDDING}Hello${POP_DIRECTIONAL_FORMATTING}`,
          arabicText: 'مرحبا',
          mixedText: 'Hello مرحبا',
          interpolation: `${LEFT_TO_RIGHT_EMBEDDING}Value: {{val}}${POP_DIRECTIONAL_FORMATTING}`,
          alreadyWrapped: `${LEFT_TO_RIGHT_EMBEDDING}Wrapped${POP_DIRECTIONAL_FORMATTING}`
        };
        // English translation
        (mockTranslocoService.getTranslation as jasmine.Spy).and.returnValue({
          engOnly: 'Hello',
          mixedText: 'Hello there',
          interpolation: 'Value: {{val}}',
          alreadyWrapped: `${LEFT_TO_RIGHT_EMBEDDING}Wrapped${POP_DIRECTIONAL_FORMATTING}`
        });
        expect(interceptor.preSaveTranslation(translations, 'ar')).toEqual(expected);
      });

      it('en should not wrap anything', () => {
        const translations: Translation = {
          engOnly: 'Hello'
        };
        expect(interceptor.preSaveTranslation(translations, 'en')).toEqual(translations);
      });

      it('should handle an empty translation object', () => {
        const translations: Translation = {};
        expect(interceptor.preSaveTranslation(translations, 'ar')).toEqual({});
      });

      it('should not wrap strings containing numbers or common symbols if they contain script chars', () => {
        const translations: Translation = {
          item123: 'مرحبا 123',
          testPunctuation: 'Test with !@#$ مرحبا'
        };
        expect(interceptor.preSaveTranslation(translations, 'ar')).toEqual(translations);
      });

      it('should wrap strings containing numbers or common symbols if they do not contain script chars', () => {
        const translations: Translation = {
          item123: 'Item 123',
          testPunctuation: 'Value is $50'
        };
        const expected: Translation = {
          item123: `${LEFT_TO_RIGHT_EMBEDDING}Item 123${POP_DIRECTIONAL_FORMATTING}`,
          testPunctuation: `${LEFT_TO_RIGHT_EMBEDDING}Value is $50${POP_DIRECTIONAL_FORMATTING}`
        };
        expect(interceptor.preSaveTranslation(translations, 'ar')).toEqual(expected);
      });
    });

    describe('preSaveTranslationKey', () => {
      it('ar should wrap LTR value', () => {
        expect(interceptor.preSaveTranslationKey('any.Hello', 'Hello', 'ar')).toBe(
          `${LEFT_TO_RIGHT_EMBEDDING}Hello${POP_DIRECTIONAL_FORMATTING}`
        );
      });

      it('Localized strings should NOT wrap', () => {
        expect(interceptor.preSaveTranslationKey('any.Hello', 'مرحبا', 'ar')).toBe('مرحبا');
        expect(interceptor.preSaveTranslationKey('any.Hello', 'Hello', 'en')).toBe('Hello');
      });

      it('value is already wrapped should NOT wrap again', () => {
        const alreadyWrapped = `${LEFT_TO_RIGHT_EMBEDDING}Wrapped${POP_DIRECTIONAL_FORMATTING}`;
        expect(interceptor.preSaveTranslationKey('any.Hello', alreadyWrapped, 'ar')).toBe(alreadyWrapped);
      });
    });
  });
});
