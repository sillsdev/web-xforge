import { TestBed } from '@angular/core/testing';
import { NllbLanguageService } from './nllb-language.service';
import { NLLB_LANGUAGES } from './nllb-languages';

describe('NllbLanguageService', () => {
  let service: NllbLanguageService;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        NllbLanguageService,
        {
          provide: NLLB_LANGUAGES,
          useValue: {
            eng: {
              name: 'English',
              iso639_1: 'en',
              iso639_2t: 'eng',
              iso639_2b: 'eng'
            }
          }
        }
      ]
    });
    service = TestBed.inject(NllbLanguageService);
  });

  describe('isNllbLanguage', () => {
    it('should return true for valid two-letter NLLB language code', () => {
      expect(service.isNllbLanguage('en')).toBe(true);
    });

    it('should return true for valid three-letter NLLB language code', () => {
      expect(service.isNllbLanguage('eng')).toBe(true);
    });

    it('should return false for invalid two-letter NLLB language code', () => {
      expect(service.isNllbLanguage('xy')).toBe(false);
    });

    it('should return false for invalid three-letter NLLB language code', () => {
      expect(service.isNllbLanguage('xyz')).toBe(false);
    });

    it('should return false for invalid length NLLB language code', () => {
      expect(service.isNllbLanguage('engl')).toBe(false);
      expect(service.isNllbLanguage('e')).toBe(false);
    });

    it('should return false for blank, null, or undefined language code', () => {
      expect(service.isNllbLanguage('')).toBe(false);
      expect(service.isNllbLanguage(null)).toBe(false);
      expect(service.isNllbLanguage(undefined)).toBe(false);
    });

    it('should return true for valid two-letter NLLB language code with culture (hyphen delimited)', () => {
      expect(service.isNllbLanguage('en-Latn-GB')).toBe(true);
    });

    it('should return false for invalid two-letter NLLB language code with culture (hyphen delimited)', () => {
      expect(service.isNllbLanguage('xy-Latn-GB')).toBe(false);
    });

    it('should return true for valid two-letter NLLB language code with culture (underscore delimited)', () => {
      expect(service.isNllbLanguage('en_Latn_GB')).toBe(true);
    });

    it('should return false for invalid two-letter NLLB language code with culture (underscore delimited)', () => {
      expect(service.isNllbLanguage('xy_Latn_GB')).toBe(false);
    });
  });
});
