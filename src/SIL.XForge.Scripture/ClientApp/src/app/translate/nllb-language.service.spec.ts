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

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('isNllbLanguage', () => {
    it('should return true for valid two-letter NLLB language code', () => {
      const result = service.isNllbLanguage('en');
      expect(result).toBe(true);
    });

    it('should return true for valid three-letter NLLB language code', () => {
      const result = service.isNllbLanguage('eng');
      expect(result).toBe(true);
    });

    it('should return false for invalid two-letter NLLB language code', () => {
      const result = service.isNllbLanguage('xy');
      expect(result).toBe(false);
    });

    it('should return false for invalid three-letter NLLB language code', () => {
      const result = service.isNllbLanguage('xyz');
      expect(result).toBe(false);
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
  });
});
