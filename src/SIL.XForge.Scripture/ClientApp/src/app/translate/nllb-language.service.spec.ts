import { HttpErrorResponse } from '@angular/common/http';
import { HttpTestingController } from '@angular/common/http/testing';
import { fakeAsync, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ErrorReportingService } from 'xforge-common/error-reporting.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { HttpClient } from '../machine-api/http-client';
import { NllbLanguageService } from './nllb-language.service';
import { NLLB_LANGUAGES } from './nllb-languages';

describe('NllbLanguageService', () => {
  let service: NllbLanguageService;
  let httpClient: HttpClient;
  let httpTestingController: HttpTestingController;
  let mockErrorReportingService: jasmine.SpyObj<ErrorReportingService>;
  let testOnlineStatusService: TestOnlineStatusService;

  beforeEach(() => {
    mockErrorReportingService = jasmine.createSpyObj<ErrorReportingService>(['silentError']);
    TestBed.configureTestingModule({
      imports: [TestOnlineStatusModule.forRoot()],
      providers: [
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
        },
        { provide: ErrorReportingService, useValue: mockErrorReportingService },
        { provide: OnlineStatusService, useClass: TestOnlineStatusService }
      ]
    });
    service = TestBed.inject(NllbLanguageService);
    httpClient = TestBed.inject(HttpClient);
    httpTestingController = TestBed.inject(HttpTestingController);
    testOnlineStatusService = TestBed.inject(OnlineStatusService) as TestOnlineStatusService;
  });

  afterEach(() => {
    httpTestingController.verify();
  });

  describe('isLanguageSupportedAsync', () => {
    beforeEach(() => {
      testOnlineStatusService.setIsOnline(true);
    });

    afterEach(() => {
      expect(httpClient.get).toHaveBeenCalled();
    });

    it('should call the API', async () => {
      httpClient.get = jasmine.createSpy().and.returnValue(of({ data: { isSupported: true, languageCode: 'abc' } }));
      expect(await service.isNllbLanguageAsync('not_in_local_database')).toBe(true);
    });

    it('should fallback to isNllbLanguage on error', fakeAsync(async () => {
      httpClient.get = jasmine.createSpy().and.returnValue(
        throwError(() => {
          new HttpErrorResponse({ status: 503 });
        })
      );
      expect(await service.isNllbLanguageAsync('en')).toBe(true);
      expect(mockErrorReportingService.silentError).toHaveBeenCalled();
    }));

    it('should fallback to isNllbLanguage on empty value', async () => {
      httpClient.get = jasmine.createSpy().and.returnValue(of({ data: {} }));
      expect(await service.isNllbLanguageAsync('en')).toBe(true);
    });
  });

  describe('isNllbLanguage fallback', () => {
    beforeEach(() => {
      httpClient.get = jasmine.createSpy().and.returnValue(of({}));
      testOnlineStatusService.setIsOnline(false);
    });

    afterEach(() => {
      expect(httpClient.get).not.toHaveBeenCalled();
    });

    it('should return true for valid two-letter NLLB language code', async () => {
      expect(await service.isNllbLanguageAsync('en')).toBe(true);
    });

    it('should return true for valid three-letter NLLB language code', async () => {
      expect(await service.isNllbLanguageAsync('eng')).toBe(true);
    });

    it('should return false for invalid two-letter NLLB language code', async () => {
      expect(await service.isNllbLanguageAsync('xy')).toBe(false);
    });

    it('should return false for invalid three-letter NLLB language code', async () => {
      expect(await service.isNllbLanguageAsync('xyz')).toBe(false);
    });

    it('should return false for invalid length NLLB language code', async () => {
      expect(await service.isNllbLanguageAsync('engl')).toBe(false);
      expect(await service.isNllbLanguageAsync('e')).toBe(false);
    });

    it('should return false for blank, null, or undefined language code', async () => {
      expect(await service.isNllbLanguageAsync('')).toBe(false);
      expect(await service.isNllbLanguageAsync(null)).toBe(false);
      expect(await service.isNllbLanguageAsync(undefined)).toBe(false);
    });

    it('should return true for valid two-letter NLLB language code with culture (hyphen delimited)', async () => {
      expect(await service.isNllbLanguageAsync('en-Latn-GB')).toBe(true);
    });

    it('should return false for invalid two-letter NLLB language code with culture (hyphen delimited)', async () => {
      expect(await service.isNllbLanguageAsync('xy-Latn-GB')).toBe(false);
    });

    it('should return true for valid two-letter NLLB language code with culture (underscore delimited)', async () => {
      expect(await service.isNllbLanguageAsync('en_Latn_GB')).toBe(true);
    });

    it('should return false for invalid two-letter NLLB language code with culture (underscore delimited)', async () => {
      expect(await service.isNllbLanguageAsync('xy_Latn_GB')).toBe(false);
    });
  });
});
