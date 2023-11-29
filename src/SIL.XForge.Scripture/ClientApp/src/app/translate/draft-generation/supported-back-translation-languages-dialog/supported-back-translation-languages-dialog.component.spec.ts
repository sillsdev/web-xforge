import { ComponentFixture, TestBed } from '@angular/core/testing';
import { mock, when } from 'ts-mockito';
import { I18nService } from 'xforge-common/i18n.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { NllbLanguage } from '../../nllb-languages';
import { SupportedBackTranslationLanguagesDialogComponent } from './supported-back-translation-languages-dialog.component';

describe('SupportedBackTranslationLanguagesDialogComponent', () => {
  let component: SupportedBackTranslationLanguagesDialogComponent;
  let fixture: ComponentFixture<SupportedBackTranslationLanguagesDialogComponent>;

  const mockI18nService = mock(I18nService);
  const language: NllbLanguage = { iso639_1: 'xy', iso639_2t: 'xyz', iso639_2b: 'xyz', name: 'TestLanguageName' };

  configureTestingModule(() => ({
    imports: [TestTranslocoModule],
    providers: [{ provide: I18nService, useMock: mockI18nService }]
  }));

  describe('getLanguageDisplayName()', () => {
    beforeEach(() => {
      fixture = TestBed.createComponent(SupportedBackTranslationLanguagesDialogComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
    });

    it('should return the language display name from the i18n service', () => {
      when(mockI18nService.getLanguageDisplayName(language.iso639_2t)).thenReturn('SomeLang');
      expect(component.getLanguageDisplayName(language)).toBe('SomeLang');
    });

    it('should return the language name if the display name is the same as the language code', () => {
      when(mockI18nService.getLanguageDisplayName(language.iso639_2t)).thenReturn('xyz');
      expect(component.getLanguageDisplayName(language)).toBe('TestLanguageName');

      when(mockI18nService.getLanguageDisplayName(language.iso639_2t)).thenReturn('xy');
      expect(component.getLanguageDisplayName(language)).toBe('TestLanguageName');
    });

    it('should return the language name if the i18n service returns undefined', () => {
      when(mockI18nService.getLanguageDisplayName(language.iso639_2t)).thenReturn(undefined);
      expect(component.getLanguageDisplayName(language)).toBe('TestLanguageName');
    });
  });
});
