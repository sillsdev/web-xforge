import { Inject, Injectable } from '@angular/core';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import FONT_FACE_DEFINITIONS from '../../../fonts.json';
import { SFProjectProfileDoc } from '../app/core/models/sf-project-profile-doc';
import { DOCUMENT } from './browser-globals';
import { isGecko } from './utils';

const DEFAULT_SERIF_FONT_FAMILY = 'Charis SIL';
const DEFAULT_SANS_SERIF_FONT_FAMILY = 'Andika';
const DEFAULT_FONT_FAMILY = DEFAULT_SERIF_FONT_FAMILY;

const GRAPHITE_SUPPORTED = isGecko();

export const FONT_FACE_FALLBACKS: { [key: string]: string } = {
  // Proprietary fonts typically used for English (where we suspect the specified font isn't that critical)
  Arial: DEFAULT_SANS_SERIF_FONT_FAMILY,
  'Times New Roman': DEFAULT_SERIF_FONT_FAMILY,
  Verdana: DEFAULT_SANS_SERIF_FONT_FAMILY,
  'Arial Unicode MS': DEFAULT_SANS_SERIF_FONT_FAMILY,
  Cambria: DEFAULT_SERIF_FONT_FAMILY,
  Sylfaen: DEFAULT_SERIF_FONT_FAMILY,
  Tahoma: DEFAULT_SANS_SERIF_FONT_FAMILY,
  Calibri: DEFAULT_SANS_SERIF_FONT_FAMILY,
  'Maiandra GD': DEFAULT_SANS_SERIF_FONT_FAMILY,

  // Freely available fonts we have yet to properly support (temporary fallbacks)
  'Suranna UI': DEFAULT_SERIF_FONT_FAMILY, // Suranna is available via Google Fonts
  'Andika New Basic': 'Andika',
  'Andika New Basic Compact': 'Andika',
  'Andika Eng-Lit': 'Andika',
  'Andika SEB': 'Andika',
  'Annapurna SIL Thami': 'Annapurna SIL',
  Gentium: 'Gentium Plus',
  'Gentium Basic': 'Gentium Plus',
  'Gentium Book Basic': 'Gentium Book Plus',
  'Lateef Haz Kas Low': 'Lateef',
  'Lateef Sindhi': 'Lateef',
  'Scheherazade New Persian': 'Scheherazade New',
  'Khmer Busra Bunong': 'Khmer Busra',

  // Unclear category
  'Karenni Unicode': 'Kay Pho Du',
  'Adobe Arabic': 'Scheherazade New',
  'Simplified Arabic': 'Scheherazade New'
};

// Only Gecko supports Graphite. When Graphite is not supported, sometimes a non-ideal font is better than trying to
// use the Graphite font.
export const NON_GRAPHITE_FALLBACKS: { [key: string]: string } = {
  'Awami Nastaliq': 'Scheherazade New'
};

@Injectable({ providedIn: 'root' })
export class FontService {
  // Map of project font names to CSS font families
  private loadedFontFamilies: Map<string, string> = new Map();
  // Requested font families that are unsupported (so we can log the warning only the first time they are encountered)
  private unsupportedFontFamilies = new Set<string>();

  constructor(@Inject(DOCUMENT) private readonly document: Document) {}

  isFontFullySupported(fontFamily: string): boolean {
    return fontFamily in FONT_FACE_DEFINITIONS;
  }

  fontFallback(fontFamily: string): string {
    return FONT_FACE_FALLBACKS[fontFamily] ?? DEFAULT_FONT_FAMILY;
  }

  /**
   * Gets a CSS font family name for a given project or project document.
   *
   * @param {SFProjectProfileDoc | SFProjectProfile | undefined} project The project.
   * @returns The CSS font family name.
   */
  getFontFamilyFromProject(project: SFProjectProfileDoc | SFProjectProfile | undefined): string {
    if (project != null && 'data' in project) {
      project = project.data;
    }

    // @ts-expect-error the update to TS ~5.5.4 throws TS2339:
    // Property 'defaultFont' does not exist on type 'SFProjectProfileDoc'
    // SFProjectProfileDoc ultimately extends SFProjectProfile, which has the defaultFont property
    return this.getCSSFontName(project?.defaultFont);
  }

  isGraphiteFont(fontFamily: string): boolean {
    return fontFamily in NON_GRAPHITE_FALLBACKS;
  }

  nonGraphiteFallback(fontFamily: string): string {
    return NON_GRAPHITE_FALLBACKS[fontFamily];
  }

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
    } else if (!GRAPHITE_SUPPORTED && NON_GRAPHITE_FALLBACKS[projectFont] != null) {
      projectFont = NON_GRAPHITE_FALLBACKS[projectFont];
    } else if (FONT_FACE_DEFINITIONS[projectFont] == null) {
      this.warnUnsupportedFont(projectFont);
      projectFont = DEFAULT_FONT_FAMILY;
    }

    if (this.loadedFontFamilies.has(projectFont)) {
      return this.loadedFontFamilies.get(projectFont)!;
    }

    let fontUrl = FONT_FACE_DEFINITIONS[projectFont];
    this.addFontFamilyToDocument(projectFont, fontUrl);
    this.loadedFontFamilies.set(projectFont, projectFont);
    return projectFont;
  }

  private warnUnsupportedFont(font: string): void {
    if (!this.unsupportedFontFamilies.has(font)) {
      this.unsupportedFontFamilies.add(font);
      console.warn(`No font definition for ${font}`);
    }
  }

  private addFontFamilyToDocument(fontFamily: string, fontUrl: string): void {
    const fontDefinition = new FontFace(fontFamily, `url(${fontUrl})`);
    (this.document.fonts as any).add(fontDefinition);
  }
}
