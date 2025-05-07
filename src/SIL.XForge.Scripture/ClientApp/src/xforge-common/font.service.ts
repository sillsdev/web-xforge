import { Inject, Injectable } from '@angular/core';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import FONT_FACE_DEFINITIONS from '../../../fonts.json';
import WRITING_SYSTEM_FONT_MAP from '../../../writing_system_font_map.json';
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

interface FontResolution {
  resolution:
    | 'specified_font'
    | 'near_match_specified_font'
    | 'writing_system_default'
    | 'non_graphite_fallback'
    | 'default_font';
  family: string;
  url: string;
  requestedFont: string | undefined;
}

export interface ProjectFontSpecification {
  writingSystem?: SFProjectProfile['writingSystem'];
  defaultFont?: SFProjectProfile['defaultFont'];
}

export class FontResolver {
  resolveFont(project: ProjectFontSpecification): FontResolution {
    const resolution = this.internalResolveFont(project);

    if (!GRAPHITE_SUPPORTED && NON_GRAPHITE_FALLBACKS[resolution.family] != null) {
      const fallbackFamily = NON_GRAPHITE_FALLBACKS[resolution.family];
      return {
        requestedFont: project.defaultFont,
        resolution: 'non_graphite_fallback',
        family: fallbackFamily,
        url: FONT_FACE_DEFINITIONS[fallbackFamily]
      };
    } else return resolution;
  }

  private internalResolveFont(project: ProjectFontSpecification): FontResolution {
    const requestedFont = project?.defaultFont;

    // Method 1: Attempt to use the specified font

    if (requestedFont != null && FONT_FACE_DEFINITIONS[requestedFont] != null) {
      return {
        requestedFont,
        resolution: 'specified_font',
        family: requestedFont,
        url: FONT_FACE_DEFINITIONS[requestedFont]
      };
    }

    // Method 2: Attempt to use a near match to the specified font

    const fallbackFamily = requestedFont == null ? null : FONT_FACE_FALLBACKS[requestedFont];
    if (fallbackFamily != null) {
      return {
        requestedFont,
        resolution: 'near_match_specified_font',
        family: fallbackFamily,
        url: FONT_FACE_DEFINITIONS[fallbackFamily]
      };
    }

    // Method 3: Use the default font for the writing system and region

    const script = project.writingSystem?.script ?? project.writingSystem?.tag?.split('-')[1];
    const region = project.writingSystem?.tag?.split('-')[2];
    const scriptAndRegion = script == null || region == null ? null : `${script}-${region}`;
    const scriptDefaultFont =
      WRITING_SYSTEM_FONT_MAP[scriptAndRegion ?? ''] ?? WRITING_SYSTEM_FONT_MAP[script ?? ''] ?? null;
    if (scriptDefaultFont != null) {
      return {
        requestedFont,
        resolution: 'writing_system_default',
        family: scriptDefaultFont,
        url: FONT_FACE_DEFINITIONS[scriptDefaultFont]
      };
    }

    // Method 4: Use a fallback font

    return {
      requestedFont,
      resolution: 'default_font',
      family: DEFAULT_FONT_FAMILY,
      url: FONT_FACE_DEFINITIONS[DEFAULT_FONT_FAMILY]
    };
  }
}

const fontResolver = new FontResolver();

@Injectable({ providedIn: 'root' })
export class FontService {
  private loadedFontFamilies = new Set<string>();
  // Requested font families that are unsupported (so we can log the warning only the first time they are encountered)
  private unsupportedFontFamilies = new Set<string>();

  constructor(@Inject(DOCUMENT) private readonly document: Document) {}

  isFontFullySupported(fontFamily: string): boolean {
    return fontFamily in FONT_FACE_DEFINITIONS;
  }

  /**
   * Gets a CSS font family name for a given project or project document.
   *
   * @param {SFProjectProfileDoc | SFProjectProfile | undefined} project The project.
   * @returns The CSS font family name.
   */
  getFontFamilyFromProject(project: SFProjectProfileDoc | ProjectFontSpecification | undefined): string {
    if (project != null && 'data' in project) project = project.data;

    const resolution = fontResolver.resolveFont(project ?? {});

    if (!this.loadedFontFamilies.has(resolution.family)) {
      this.addFontFamilyToDocument(resolution.family, resolution.url);
      this.loadedFontFamilies.add(resolution.family);
    }

    if (project != null && resolution.resolution !== 'specified_font') {
      this.warnUnsupportedFont(resolution.requestedFont ?? '<UNKNOWN FONT>');
    }

    return resolution.family;
  }

  isGraphiteFont(fontFamily: string): boolean {
    return fontFamily in NON_GRAPHITE_FALLBACKS;
  }

  nonGraphiteFallback(fontFamily: string): string {
    return NON_GRAPHITE_FALLBACKS[fontFamily];
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
