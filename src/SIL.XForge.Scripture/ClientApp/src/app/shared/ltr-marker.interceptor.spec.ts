import { TestBed } from '@angular/core/testing';
import { Translation } from '@ngneat/transloco';
import { LtrMarkerInterceptor } from './ltr-marker.interceptor';

describe('LtrMarkerInterceptor', () => {
  let interceptor: LtrMarkerInterceptor;

  const LRE = '\u202A';
  const PDF = '\u202C';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [LtrMarkerInterceptor]
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
          empty: '',
          alreadyWrapped: `${LRE}Wrapped${PDF}`
        };
        const expected: Translation = {
          engOnly: `${LRE}Hello${PDF}`,
          arabicText: 'مرحبا',
          mixedText: 'Hello مرحبا',
          interpolation: `${LRE}Value: {{val}}${PDF}`,
          empty: '',
          alreadyWrapped: `${LRE}Wrapped${PDF}`
        };
        expect(interceptor.preSaveTranslation(translations, 'ar')).toEqual(expected);
      });

      it('en should not wrap anything', () => {
        const translations: Translation = {
          engOnly: 'Hello',
          arabicText: 'مرحبا'
        };
        expect(interceptor.preSaveTranslation(translations, 'en')).toEqual(translations);
      });

      it('should handle an empty translation object', () => {
        const translations: Translation = {};
        expect(interceptor.preSaveTranslation(translations, 'en')).toEqual({});
      });

      it('should not wrap strings containing numbers or common symbols if they also contain UI script chars', () => {
        const translations: Translation = {
          key1: 'مرحبا 123',
          key2: 'Test with !@#$ مرحبا'
        };
        expect(interceptor.preSaveTranslation(translations, 'en')).toEqual(translations);
      });

      it('should wrap strings containing numbers or common symbols if they DO NOT contain UI script chars', () => {
        const translations: Translation = {
          key1: 'Item 123',
          key2: 'Value is $50'
        };
        const expected: Translation = {
          key1: `${LRE}Item 123${PDF}`,
          key2: `${LRE}Value is $50${PDF}`
        };
        expect(interceptor.preSaveTranslation(translations, 'ar')).toEqual(expected);
      });
    });

    describe('preSaveTranslationKey', () => {
      it('ar should wrap LTR value', () => {
        expect(interceptor.preSaveTranslationKey('any.key', 'Hello', 'ar')).toBe(`${LRE}Hello${PDF}`);
      });

      it('Localized strings should NOT wrap', () => {
        expect(interceptor.preSaveTranslationKey('any.key', 'مرحبا', 'ar')).toBe('مرحبا');
        expect(interceptor.preSaveTranslationKey('any.key', 'Hello', 'en')).toBe('Hello');
      });

      it('value is already wrapped should NOT wrap again', () => {
        const alreadyWrapped = `${LRE}Wrapped${PDF}`;
        expect(interceptor.preSaveTranslationKey('any.key', alreadyWrapped, 'ar')).toBe(alreadyWrapped);
      });
    });
  });
});
