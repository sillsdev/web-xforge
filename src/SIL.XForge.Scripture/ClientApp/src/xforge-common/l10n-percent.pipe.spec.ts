import { instance, mock, when } from 'ts-mockito';
import { I18nService } from './i18n.service';
import { L10nPercentFormatService, L10nPercentPipe } from './l10n-percent.pipe';

const mockedI18nService = mock(I18nService);

describe('l10nPercentPipe', () => {
  it('should transform percent to localized string', () => {
    const env = new TestEnvironment('en-US');
    expect(env.pipe.transform(0.05)).toBe('5%');
  });

  it('should use the correct locale code from i18n service', () => {
    const env = new TestEnvironment('de-DE');
    expect(env.pipe.transform(0.05)).toBe('5 %');
  });

  it('should handle changing active locales', () => {
    const env = new TestEnvironment('en-US');
    expect(env.pipe.transform(0.05)).toBe('5%');
    when(mockedI18nService.localeCode).thenReturn('de-DE');
    expect(env.pipe.transform(0.05)).toBe('5 %');
  });
});

class TestEnvironment {
  pipe: L10nPercentPipe;

  constructor(localeCode: string) {
    when(mockedI18nService.localeCode).thenReturn(localeCode);
    this.pipe = new L10nPercentPipe(new L10nPercentFormatService(instance(mockedI18nService)));
  }
}
