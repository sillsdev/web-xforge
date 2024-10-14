import { instance, mock, when } from 'ts-mockito';
import { I18nService } from './i18n.service';
import { L10nNumberFormatService, L10nNumberPipe } from './l10n-number.pipe';

const mockedI18nService = mock(I18nService);

describe('l10nNumberPipe', () => {
  it('should transform number to localized string', () => {
    const env = new TestEnvironment('en-US');
    expect(env.pipe.transform(1234567)).toBe('1,234,567');
  });

  it('should use the correct locale code from i18n service', () => {
    const env = new TestEnvironment('de-DE');
    expect(env.pipe.transform(1234567)).toBe('1.234.567');
  });

  it('should handle changing active locales', () => {
    const env = new TestEnvironment('en-US');
    expect(env.pipe.transform(1234567)).toBe('1,234,567');
    when(mockedI18nService.localeCode).thenReturn('de-DE');
    expect(env.pipe.transform(1234567)).toBe('1.234.567');
  });
});

class TestEnvironment {
  pipe: L10nNumberPipe;

  constructor(localeCode: string) {
    when(mockedI18nService.localeCode).thenReturn(localeCode);
    this.pipe = new L10nNumberPipe(new L10nNumberFormatService(instance(mockedI18nService)));
  }
}
