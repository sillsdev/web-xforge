import { Injectable } from '@angular/core';
import { SFProjectProfileDoc } from 'src/app/core/models/sf-project-profile-doc';

const DEFAULT_SERIF_FONT_FAMILY = 'Charis SIL';
const DEFAULT_SANS_SERIF_FONT_FAMILY = 'Andika';
const DEFAULT_FONT_FAMILY = DEFAULT_SERIF_FONT_FAMILY;

const FONT_FACE_FALLBACKS: { [key: string]: string } = {
  // Proprietary fonts typically used for English (where we suspect the specified font isn't that critical)
  Arial: DEFAULT_SANS_SERIF_FONT_FAMILY,
  'Times New Roman': DEFAULT_SERIF_FONT_FAMILY,
  Verdana: DEFAULT_SANS_SERIF_FONT_FAMILY,
  'Arial Unicode MS': DEFAULT_SANS_SERIF_FONT_FAMILY,
  Cambria: DEFAULT_SERIF_FONT_FAMILY,
  Sylfaen: DEFAULT_SERIF_FONT_FAMILY,
  Tahoma: DEFAULT_SANS_SERIF_FONT_FAMILY,
  Calibri: DEFAULT_SANS_SERIF_FONT_FAMILY,

  // Freely available fonts we have yet to properly support (temporary fallbacks)
  'Suranna UI': DEFAULT_SERIF_FONT_FAMILY, // Suranna is available via Google Fonts
  'Andika New Basic': 'Andika',
  'Andika New Basic Compact': 'Andika',
  'Andika Eng-Lit': 'Andika',
  'Andika SEB': 'Andika',
  'Annapurna SIL Nepal': 'Annapurna SIL',
  'Annapurna SIL Thami': 'Annapurna SIL', // Misspelling?
  'Annapurna SIL Thamil': 'Annapurna SIL',
  Gentium: 'Gentium Plus',
  'Gentium Basic': 'Gentium Plus',
  'Gentium Book Basic': 'Gentium Book Plus',
  'Lateef Haz Kas Low': 'Lateef',
  'Lateef Sindhi': 'Lateef',
  'Scheherazade New Persian': 'Scheherazade New',

  // Unclear category
  'Karenni Unicode': 'Kay Pho Du',
  'Adobe Arabic': 'Scheherazade New',
  'Simplified Arabic': 'Scheherazade New'
};

const FONT_FACE_DEFINITIONS: { [key: string]: string } = {
  'Abyssinica SIL': 'https://fonts.languagetechnology.org/fonts/sil/abyssinicasil/web/AbyssinicaSIL-Regular.woff2',
  Akatab: 'https://fonts.languagetechnology.org/fonts/sil/akatab/web/Akatab-Regular.woff2',
  Alkalami: 'https://fonts.languagetechnology.org/fonts/sil/alkalami/web/Alkalami-Regular.woff2',
  Andika: 'https://fonts.languagetechnology.org/fonts/sil/andika/web/Andika-Regular.woff2',
  'Annapurna SIL': 'https://fonts.languagetechnology.org/fonts/sil/annapurnasil/web/AnnapurnaSIL-Regular.woff2',
  'Awami Nastaliq': 'https://fonts.languagetechnology.org/fonts/sil/awaminastaliq/web/AwamiNastaliq-Regular.woff2',
  Badami: 'https://fonts.languagetechnology.org/fonts/other/badami/woff/Badami-Regular.woff2',
  Bailey: 'https://fonts.languagetechnology.org/fonts/other/bailey/web/Bailey-Regular.woff2',
  'Charis SIL': 'https://fonts.languagetechnology.org/fonts/sil/charissil/web/CharisSIL-Regular.woff2',
  'Dai Banna SIL': 'https://fonts.languagetechnology.org/fonts/sil/daibannasil/web/DaiBannaSIL-Regular.woff2',
  'Doulos SIL': 'https://fonts.languagetechnology.org/fonts/sil/doulossil/web/DoulosSIL-Regular.woff2',
  Eeyek: 'https://fonts.languagetechnology.org/fonts/sil/eeyek/web/Eeyek-Regular.woff',
  'Ezra SIL': 'https://fonts.languagetechnology.org/fonts/sil/ezrasil/web/SILEOT.woff',
  'Ezra SIL SR': 'https://fonts.languagetechnology.org/fonts/sil/ezrasilsr/web/SILEOTSR.woff',
  'Galatia SIL': 'https://fonts.languagetechnology.org/fonts/sil/galatiasil/web/GalSILR.woff',
  'Gentium Book Plus':
    'https://fonts.languagetechnology.org/fonts/sil/gentiumbookplus/web/GentiumBookPlus-Regular.woff2',
  'Gentium Plus': 'https://fonts.languagetechnology.org/fonts/sil/gentiumplus/web/GentiumPlus-Regular.woff2',
  Harmattan: 'https://fonts.languagetechnology.org/fonts/sil/harmattan/web/Harmattan-Regular.woff2',
  'Japa Sans Oriya': 'https://fonts.languagetechnology.org/fonts/sil/japasansoriya/woff/JapaSansOriya-Regular.woff2',
  Kanchenjunga: 'https://fonts.languagetechnology.org/fonts/sil/kanchenjunga/web/Kanchenjunga-Regular.woff2',
  'Kay Pho Du': 'https://fonts.languagetechnology.org/fonts/sil/kayphodu/web/KayPhoDu-Regular.woff2',
  Lateef: 'https://fonts.languagetechnology.org/fonts/sil/lateef/web/Lateef-Regular.woff2',
  'Lisu Bosa': 'https://fonts.languagetechnology.org/fonts/sil/lisubosa/web/LisuBosa-Regular.woff2',
  Mingzat: 'https://fonts.languagetechnology.org/fonts/sil/mingzat/web/Mingzat-Regular.woff2',
  Namdhinggo: 'https://fonts.languagetechnology.org/fonts/sil/namdhinggo/web/Namdhinggo-Regular.woff2',
  Narnoor: 'https://fonts.languagetechnology.org/fonts/sil/narnoor/web/Narnoor-Regular.woff2',
  Nokyung: 'https://fonts.languagetechnology.org/fonts/sil/nokyung/web/Nokyung-Regular.woff',
  'Nuosu SIL': 'https://fonts.languagetechnology.org/fonts/sil/nuosusil/web/NuosuSIL-Regular.woff2',
  Padauk: 'https://fonts.languagetechnology.org/fonts/sil/padauk/web/Padauk-Regular.woff2',
  'Padauk Book': 'https://fonts.languagetechnology.org/fonts/sil/padaukbook/web/PadaukBook-Regular.woff2',
  'Payap Lanna': 'https://fonts.languagetechnology.org/fonts/sil/payaplanna/web/PayapLanna-Regular.woff2',
  Ruwudu: 'https://fonts.languagetechnology.org/fonts/sil/ruwudu/web/Ruwudu-Regular.woff2',
  Scheherazade: 'https://fonts.languagetechnology.org/fonts/sil/scheherazade/web/Scheherazade-Regular.woff',
  'Scheherazade New':
    'https://fonts.languagetechnology.org/fonts/sil/scheherazadenew/web/ScheherazadeNew-Regular.woff2',
  Surma: 'https://fonts.languagetechnology.org/fonts/other/surma/Surma-Regular.woff2',
  Tagmukay: 'https://fonts.languagetechnology.org/fonts/sil/tagmukay/web/Tagmukay-Regular.woff',
  'Tai Heritage Pro': 'https://fonts.languagetechnology.org/fonts/sil/taiheritagepro/web/TaiHeritagePro-Regular.woff',
  ThiruValluvar: 'https://fonts.languagetechnology.org/fonts/other/thiruvalluvar/woff/ThiruValluvar-Regular.woff2'
};

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
    if (projectFont == null || projectFont === '') {
      projectFont = DEFAULT_FONT_FAMILY;
    } else if (FONT_FACE_DEFINITIONS[projectFont] == null && FONT_FACE_FALLBACKS[projectFont] != null) {
      projectFont = FONT_FACE_FALLBACKS[projectFont];
    }

    if (this.loadedFontFamilies.has(projectFont)) {
      return this.loadedFontFamilies.get(projectFont)!;
    }

    let fontUrl = FONT_FACE_DEFINITIONS[projectFont];
    if (fontUrl == null) {
      if (!this.unsupportedFontFamilies.has(projectFont)) {
        this.unsupportedFontFamilies.add(projectFont);
        console.warn(`No font definition for ${projectFont}`);
      }
      // TODO Add a warning on the project that the font specified is not supported
      projectFont = DEFAULT_FONT_FAMILY;
      fontUrl = FONT_FACE_DEFINITIONS[projectFont];
    }

    const fontDefinition = new FontFace(projectFont, `url(${fontUrl})`);

    (document.fonts as any).add(fontDefinition);
    return fontDefinition.family;
  }

  getFontFamilyFromProject(projectDoc: SFProjectProfileDoc | undefined): string {
    return this.getCSSFontName(projectDoc?.data?.defaultFont);
  }

  // Basic check to make sure no fallbacks weren't actually defined. To be called by tests.
  getBrokenFontFallbacks(): string[] {
    return Object.values(FONT_FACE_FALLBACKS).filter(fallback => FONT_FACE_DEFINITIONS[fallback] == null);
  }
}