import { Injectable } from '@angular/core';
import { SFProjectProfileDoc } from 'src/app/core/models/sf-project-profile-doc';

// TODO add more fonts from software.sil.org/fonts and map proprietary font names to similar freely licensed fonts
const FONT_FACE_DEFINITIONS: { [key: string]: FontFace } = {
  ['Charis SIL']: new FontFace(
    'Charis SIL',
    "url('https://fonts.languagetechnology.org/fonts/sil/charissil/web/CharisSIL-Regular.woff2') format('woff2')"
  ),
  ['Annapurna SIL Nepal']: new FontFace(
    'Annapurna SIL Nepal',
    "url('https://fonts.languagetechnology.org/fonts/sil/annapurnasil/web/AnnapurnaSIL-Regular.woff2') format('woff2')"
    // TODO Specify font features for the Nepal variant. This is the most specified SIL font other than Charis SIL, and
    // it's probably better to support it without the font features that it really should have, than to not support it
    // at all. For information about the Nepal version, see https://software.sil.org/annapurna/download/
  ),
  ['Annapurna SIL']: new FontFace(
    'Annapurna SIL',
    "url('https://fonts.languagetechnology.org/fonts/sil/annapurnasil/web/AnnapurnaSIL-Regular.woff2') format('woff2')"
  ),
  ['Awami Nastaliq']: new FontFace(
    'Awami Nastaliq',
    "url('https://fonts.languagetechnology.org/fonts/sil/awaminastaliq/web/AwamiNastaliq-Regular.woff2') format('woff2')"
  ),
  ['Scheherazade New']: new FontFace(
    'Scheherazade New',
    "url('https://fonts.languagetechnology.org/fonts/sil/scheherazadenew/web/ScheherazadeNew-Regular.woff2') format('woff2')"
  ),
  ['Scheherazade']: new FontFace(
    'Scheherazade',
    "url('https://fonts.languagetechnology.org/fonts/sil/scheherazade/web/Scheherazade-Regular.woff') format('woff')"
  ),
  // TODO Warn that this is a fallback font
  // This font was only added to prevent a regression, since a Karenni font had previously been added at user request
  ['Karenni Unicode']: new FontFace(
    'Kay Pho Du',
    "url('https://fonts.languagetechnology.org/fonts/sil/kayphodu/web/KayPhoDu-Regular.woff2') format('woff2')"
  )
};

const DEFAULT_FONT_FAMILY = 'Charis SIL';

@Injectable({ providedIn: 'root' })
export class FontService {
  // Map of project font names to CSS font families
  private loadedFontFamilies: Map<string, string> = new Map();
  // Requested font families that are unsupported (so we can log the warning only the first time they are encountered)
  private unsupportedFontFamilies = new Set<string>();

  /**
   * Gets a CSS font family name for a given project's specified font. These may or may not be the same. If the
   * specified font has not yet been loaded, it is loaded.
   * @param projectFont The font specified in the project settings.
   * @returns A font family that can be used in CSS to specify the font.
   */
  getCSSFontName(projectFont: string | undefined): string {
    if (projectFont == null) {
      projectFont = DEFAULT_FONT_FAMILY;
    }
    if (this.loadedFontFamilies.has(projectFont)) {
      return this.loadedFontFamilies.get(projectFont)!;
    }

    const fontDefinition = FONT_FACE_DEFINITIONS[projectFont];
    if (fontDefinition == null) {
      if (!this.unsupportedFontFamilies.has(fontDefinition)) {
        this.unsupportedFontFamilies.add(fontDefinition);
        console.warn(`No font definition for ${projectFont}`);
      }
      // TODO Add a warning on the project that the font specified is not supported
      return DEFAULT_FONT_FAMILY;
    } else {
      (document.fonts as any).add(fontDefinition);
      return fontDefinition.family;
    }
  }

  getFontFamilyFromProject(projectDoc: SFProjectProfileDoc | undefined): string {
    return this.getCSSFontName(projectDoc?.data?.defaultFont);
  }
}
