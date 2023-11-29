import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Inject } from '@angular/core';
import { MatLegacyButtonModule as MatButtonModule } from '@angular/material/legacy-button';
import { MatIconModule } from '@angular/material/icon';
import { MatLegacyDialogModule as MatDialogModule } from '@angular/material/legacy-dialog';
import { TranslocoModule } from '@ngneat/transloco';
import { I18nService } from 'xforge-common/i18n.service';
import { NllbLanguage, NllbLanguageDict, NLLB_LANGUAGES } from '../../nllb-languages';

@Component({
  selector: 'app-supported-back-translation-languages-dialog',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatDialogModule, MatButtonModule, TranslocoModule],
  templateUrl: './supported-back-translation-languages-dialog.component.html',
  styleUrls: ['./supported-back-translation-languages-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SupportedBackTranslationLanguagesDialogComponent {
  supportedLanguages: NllbLanguage[] = Object.values(this.nllbLanguages);

  constructor(
    @Inject(NLLB_LANGUAGES) private readonly nllbLanguages: NllbLanguageDict,
    private readonly i18n: I18nService
  ) {}

  getLanguageDisplayName(language: NllbLanguage): string {
    const displayName = this.i18n.getLanguageDisplayName(language.iso639_2t);

    // If the display name is the same as the language code, just return the name
    if (displayName == null || displayName === language.iso639_1 || displayName === language.iso639_2t) {
      return language.name;
    }

    return displayName;
  }
}
