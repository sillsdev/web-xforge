import { TranslocoService } from '@ngneat/transloco';
import { CookieService } from 'ngx-cookie-service';
import { anything, deepEqual, instance, mock, verify, when } from 'ts-mockito';
import { I18nService } from './i18n.service';

const mockedTranslocoService = mock(TranslocoService);
const mockedCookieService = mock(CookieService);

describe('I18nService', () => {
  it('should be able to get a locale', () => {
    expect(I18nService.getLocale('en')).toBeDefined();
    expect(I18nService.getLocale('en')!.canonicalTag).toEqual('en');
  });

  it('should set locale', () => {
    const service = new I18nService(instance(mockedTranslocoService), instance(mockedCookieService));
    expect(service).toBeTruthy();
    service.setLocale('zh-CN');
    verify(mockedTranslocoService.setActiveLang('zh-CN')).called();
    expect(service.localeCode).toEqual('zh-CN');
  });

  it('should wrap text with HTML tags', () => {
    when(mockedTranslocoService.translate<string>(anything(), anything())).thenReturn('translated key');
    const service = new I18nService(instance(mockedTranslocoService), instance(mockedCookieService));
    expect(
      service.translateAndInsertTags('namespace.key', {
        value: 2,
        spanClass: 'text'
      })
    ).toEqual('translated key');
    verify(
      mockedTranslocoService.translate(
        'namespace.key',
        deepEqual({
          value: 2,
          spanClass: 'text',
          strongStart: '<strong>',
          strongEnd: '</strong>',
          emStart: '<em>',
          emEnd: '</em>',
          spanStart: '<span class="text">',
          spanEnd: '</span>'
        })
      )
    ).once();
  });

  it('should localize dates', () => {
    const date = new Date('November 25, 1991 17:28');
    const service = new I18nService(instance(mockedTranslocoService), instance(mockedCookieService));
    expect(service.formatDate(date)).toEqual('Nov 25, 1991, 5:28 PM');
    service.setLocale('en-GB');
    expect(service.formatDate(date)).toEqual('25 Nov 1991, 17:28');
    service.setLocale('zh-CN');
    expect(service.formatDate(date)).toEqual('1991/11/25 下午5:28');
  });
});
