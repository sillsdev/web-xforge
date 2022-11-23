import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@ngneat/transloco';
import { CookieService } from 'ngx-cookie-service';
import { VerseRef } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/verse-ref';
import { anything, deepEqual, instance, mock, verify, when } from 'ts-mockito';
import { ErrorReportingService } from 'xforge-common/error-reporting.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { AuthService } from './auth.service';
import { DOCUMENT } from './browser-globals';
import { BugsnagService } from './bugsnag.service';
import { I18nService } from './i18n.service';
import { LocationService } from './location.service';

const mockedLocationService = mock(LocationService);
const mockedBugsnagService = mock(BugsnagService);
const mockedAuthService = mock(AuthService);
const mockedTranslocoService = mock(TranslocoService);
const mockedCookieService = mock(CookieService);
const mockedErrorReportingService = mock(ErrorReportingService);
const mockedDocument = mock(Document);
const mockedDocumentBody = mock(HTMLBodyElement);

describe('I18nService', () => {
  configureTestingModule(() => ({
    declarations: [],
    imports: [],
    providers: [
      { provide: LocationService, useMock: mockedLocationService },
      { provide: BugsnagService, useMock: mockedBugsnagService },
      { provide: AuthService, useMock: mockedAuthService },
      { provide: TranslocoService, useMock: mockedTranslocoService },
      { provide: CookieService, useMock: mockedCookieService },
      { provide: ErrorReportingService, useMock: mockedErrorReportingService },
      { provide: DOCUMENT, useMock: mockedDocument },
      { provide: HTMLBodyElement, useMock: mockedDocumentBody }
    ]
  }));

  it('should be able to get a locale', () => {
    expect(I18nService.getLocale('en')).toBeDefined();
    expect(I18nService.getLocale('en')!.canonicalTag).toEqual('en');
  });

  it('should set locale', () => {
    const service = getI18nService();
    expect(service).toBeTruthy();
    service.setLocale('zh-CN', instance(mockedAuthService));
    verify(mockedTranslocoService.setActiveLang('zh-CN')).called();
    verify(mockedAuthService.updateInterfaceLanguage('zh-CN')).called();
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
          spanEnd: '</span>'
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
    expect(service.formatDate(date)).toEqual('Nov 25, 1991, 5:28 PM');

    service.setLocale('en-GB', mockedAuthService);
    expect(service.formatDate(date)).toEqual('25 Nov 1991, 5:28 pm');

    // As of Chromium 98 for zh-CN it's changed from using characters to indicate AM/PM, to using a 24 hour clock. It's
    // unclear whether the cause is Chromium itself or a localization library. The tests should pass with either version
    service.setLocale('zh-CN', mockedAuthService);
    expect(['1991/11/25 17:28', '1991/11/25下午5:28']).toContain(service.formatDate(date));

    service.setLocale('az', mockedAuthService);
    expect(service.formatDate(date)).toEqual('25.11.1991 17:28');
  });

  it('should interpolate translations', () => {
    when(mockedTranslocoService.translate<string>('app.settings', anything())).thenReturn(
      'A quick brown { 1 }fox{ 2 } jumps over the lazy { 3 }dog{ 4 }.'
    );
    const service = getI18nService();
    expect(service.interpolate('app.settings')).toEqual([
      { text: 'A quick brown ' },
      { text: 'fox', id: 1 },
      { text: ' jumps over the lazy ' },
      { text: 'dog', id: 3 },
      { text: '.' }
    ]);
  });

  it('should set text direction on the body element', () => {
    const service = getI18nService();
    verify(mockedDocumentBody.setAttribute('dir', 'ltr')).never();
    service.setLocale('zh-CN', mockedAuthService);
    verify(mockedDocumentBody.setAttribute('dir', 'ltr')).once();
    service.setLocale('ar', mockedAuthService);
    verify(mockedDocumentBody.setAttribute('dir', 'rtl')).once();
    expect().nothing();
  });

  it('should localize references', () => {
    when(mockedTranslocoService.translate<string>('canon.book_names.GEN')).thenReturn('Genesis');
    const service = getI18nService();
    expect(service.localizeReference(VerseRef.parse('GEN 1:2-3'))).toBe('Genesis 1:2-3');
    service.setLocale('ar', mockedAuthService);
    // Expect right to left mark before : and - characters
    expect(service.localizeReference(VerseRef.parse('GEN 1:2-3'))).toBe('Genesis 1\u200F:2\u200F-3');
  });
});

function getI18nService(): I18nService {
  when(mockedDocument.body).thenReturn(instance(mockedDocumentBody));
  return TestBed.inject(I18nService);
}
