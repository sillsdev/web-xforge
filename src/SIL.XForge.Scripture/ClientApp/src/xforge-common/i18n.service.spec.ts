import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@ngneat/transloco';
import { VerseRef } from '@sillsdev/scripture';
import { CookieService } from 'ngx-cookie-service';
import { of } from 'rxjs';
import { anything, deepEqual, instance, mock, verify, when } from 'ts-mockito';
import { ErrorReportingService } from 'xforge-common/error-reporting.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { DOCUMENT } from './browser-globals';
import { BugsnagService } from './bugsnag.service';
import { I18nService } from './i18n.service';
import { LocationService } from './location.service';
import { isSafari } from './utils';

const mockedLocationService = mock(LocationService);
const mockedBugsnagService = mock(BugsnagService);
const mockedTranslocoService = mock(TranslocoService);
const mockedCookieService = mock(CookieService);
const mockedErrorReportingService = mock(ErrorReportingService);
const mockedDocument = mock(Document);
const mockedDocumentBody = mock(HTMLBodyElement);

describe('I18nService', () => {
  configureTestingModule(() => ({
    declarations: [],
    providers: [
      { provide: LocationService, useMock: mockedLocationService },
      { provide: BugsnagService, useMock: mockedBugsnagService },
      { provide: TranslocoService, useMock: mockedTranslocoService },
      { provide: CookieService, useMock: mockedCookieService },
      { provide: ErrorReportingService, useMock: mockedErrorReportingService },
      { provide: DOCUMENT, useMock: mockedDocument },
      { provide: HTMLBodyElement, useMock: mockedDocumentBody },
      provideHttpClient(withInterceptorsFromDi()),
      provideHttpClientTesting()
    ]
  }));

  it('should be able to get a locale', () => {
    expect(I18nService.getLocale('en')).toBeDefined();
    expect(I18nService.getLocale('en')!.canonicalTag).toEqual('en');
  });

  it('should set locale', () => {
    const service = getI18nService();
    expect(service).toBeTruthy();
    service.setLocale('zh-CN');
    verify(mockedTranslocoService.setActiveLang('zh-CN')).called();
    expect(service.localeCode).toEqual('zh-CN');
  });

  it('should wrap text with HTML tags', () => {
    when(mockedTranslocoService.translate<string>(anything(), anything())).thenReturn('translated key');
    const service = getI18nService();
    expect(
      service.translateAndInsertTags('app.settings', {
        value: 2,
        spanClass: 'text'
      })
    ).toEqual('translated key');
    verify(
      mockedTranslocoService.translate(
        'app.settings',
        deepEqual({
          value: 2,
          spanClass: 'text',
          boldStart: '<strong>',
          boldEnd: '</strong>',
          italicsStart: '<em>',
          italicsEnd: '</em>',
          newLine: '<br />',
          spanStart: '<span class="text">',
          spanEnd: '</span>',
          underlineStart: '<u>',
          underlineEnd: '</u>'
        })
      )
    ).once();
  });

  it('should translate text around a template tag', () => {
    when(mockedTranslocoService.translate<string>(anything(), anything())).thenReturn(
      'translated key with {{ boundary }}tag text{{ boundary }} in template'
    );
    const service = getI18nService();
    expect(service.translateTextAroundTemplateTags('app.settings')).toEqual({
      before: 'translated key with ',
      templateTagText: 'tag text',
      after: ' in template'
    });
  });

  it('should localize dates', () => {
    const date = new Date('November 25, 1991 17:28');
    const service = getI18nService();
    // As of Chromium 110 the space between the minutes and AM/PM has been changed to U+202F (NARROW NO-BREAK SPACE)
    // Test for any white space character for maximum compatibility
    if (isSafari()) {
      expect(service.formatDate(date)).toMatch(/Nov 25, 1991 at 5:28\sPM/);
    } else {
      // Chrome, Firefox
      expect(service.formatDate(date)).toMatch(/Nov 25, 1991, 5:28\sPM/);
    }

    service.setLocale('en-GB');
    if (isSafari()) {
      expect(service.formatDate(date)).toMatch(/25 Nov 1991 at 5:28\spm/);
    } else {
      // Chrome, Firefox
      expect(service.formatDate(date)).toMatch(/25 Nov 1991, 5:28\spm/);
    }

    // As of Chromium 98 for zh-CN it's changed from using characters to indicate AM/PM, to using a 24 hour clock. It's
    // unclear whether the cause is Chromium itself or a localization library. The tests should pass with either version
    service.setLocale('zh-CN');
    expect(['1991/11/25 17:28', '1991/11/25下午5:28']).toContain(service.formatDate(date));

    service.setLocale('az');
    expect(service.formatDate(date)).toEqual('25.11.1991 17:28');
  });

  it('should support including the timezone in the date', () => {
    const date = new Date('November 25, 1991 17:28');
    const service = getI18nService();

    // look for ending with something like " UTC+5" or " EST"
    const trailingTimezoneRegex = / (UTC[+-−]\d+|[A-Z]+)$/;

    service.setLocale('fr');
    expect(service.formatDate(date, { showTimeZone: true })).toMatch(trailingTimezoneRegex);

    service.setLocale('az');
    expect(service.formatDate(date, { showTimeZone: true })).toMatch(trailingTimezoneRegex);
  });

  it('should interpolate translations around and within numbered template tags', done => {
    when(mockedTranslocoService.selectTranslate<string>('app.settings', anything())).thenReturn(
      of('A quick brown { 1 }fox{ 2 } jumps over the lazy { 3 }dog{ 4 }.')
    );
    const service = getI18nService();
    service.interpolate('app.settings').subscribe(value => {
      expect(value).toEqual([
        { text: 'A quick brown ' },
        { text: 'fox', id: 1 },
        { text: ' jumps over the lazy ' },
        { text: 'dog', id: 3 },
        { text: '.' }
      ]);
      done();
    });
  });

  it('should interpolate translations around template variables', () => {
    when(mockedTranslocoService.getActiveLang()).thenReturn('en');
    when(mockedTranslocoService.getTranslation('en')).thenReturn({
      'error.to_report_issue_email': 'Please email {{ email }} for help.'
    });
    const service = getI18nService();
    expect(service.interpolateVariables('error.to_report_issue_email', { email: 'email@example.com' })).toEqual([
      { text: 'Please email ' },
      { text: 'email@example.com', id: 'email' },
      { text: ' for help.' }
    ]);
  });

  it('should set text direction on the body element', () => {
    const service = getI18nService();
    verify(mockedDocumentBody.setAttribute('dir', 'ltr')).never();
    service.setLocale('zh-CN');
    verify(mockedDocumentBody.setAttribute('dir', 'ltr')).once();
    service.setLocale('ar');
    verify(mockedDocumentBody.setAttribute('dir', 'rtl')).once();
    expect().nothing();
  });

  it('should localize references', () => {
    when(mockedTranslocoService.translate<string>('canon.book_names.GEN')).thenReturn('Genesis');
    const service = getI18nService();
    expect(service.localizeReference(new VerseRef('GEN 1:2-3'))).toBe('Genesis 1:2-3');
    service.setLocale('ar');
    // Expect right-to-left mark before chapter num, ':', and '-' characters
    expect(service.localizeReference(new VerseRef('GEN 1:2-3'))).toBe('Genesis \u200F1\u200F:2\u200F-3');
  });

  describe('getLanguageDisplayName', () => {
    it('should return the display name for a valid language code', () => {
      const service = getI18nService();
      service.setLocale('en');
      expect(service.getLanguageDisplayName('en')).toBe('English');
    });

    it('should return undefined for an undefined language code', () => {
      const service = getI18nService();
      service.setLocale('en');
      expect(service.getLanguageDisplayName(undefined)).toBeUndefined();
    });

    it('should return language code for an unknown language code', () => {
      const service = getI18nService();
      service.setLocale('en');
      expect(service.getLanguageDisplayName('123')).toBe('123');
    });
  });
});

function getI18nService(): I18nService {
  when(mockedDocument.body).thenReturn(instance(mockedDocumentBody));
  return TestBed.inject(I18nService);
}
