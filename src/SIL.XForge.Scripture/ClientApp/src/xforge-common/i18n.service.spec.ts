import { TranslocoService } from '@ngneat/transloco';
import { instance, mock, verify } from 'ts-mockito';
import { I18nService } from './i18n.service';

describe('I18nService', () => {
  it('should be able to get a locale', () => {
    expect(I18nService.getLocale('en')).toBeDefined();
    expect(I18nService.getLocale('en').localeCode).toEqual('en');
  });

  it('should set locale', () => {
    const mockedTranslocoService = mock(TranslocoService);
    const service = new I18nService(instance(mockedTranslocoService));
    expect(service).toBeTruthy();
    service.setLocale('zh_CN');
    verify(mockedTranslocoService.setActiveLang('zh_CN')).called();
    expect(service.localeCode).toEqual('zh_CN');
  });
});
