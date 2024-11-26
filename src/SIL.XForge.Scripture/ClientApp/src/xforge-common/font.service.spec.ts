import FONT_FACE_DEFINITIONS from '../../../fonts.json';
import { FONT_FACE_FALLBACKS, FontResolver, FontService } from './font.service';
import { MockConsole } from './mock-console';

// Mocking the document with ts-mockito does not work because the type definitions for document.fonts does not include
// the add method
class FakeDocument {
  addCount = 0;
  fonts = {
    add: (_: any) => {
      this.addCount++;
    }
  };
}

const mockedConsole: MockConsole = MockConsole.install();
describe('FontResolver', () => {
  const fontResolver = new FontResolver();

  it('can resolve specified_font', () => {
    const resolution = fontResolver.resolveFont({ defaultFont: 'Andika', writingSystem: { tag: 'en' } });
    expect(resolution).toEqual({
      requestedFont: 'Andika',
      resolution: 'specified_font',
      family: 'Andika',
      url: FONT_FACE_DEFINITIONS['Andika']
    });
  });

  it('can resolve near_match_specified_font', () => {
    const resolution = fontResolver.resolveFont({ defaultFont: 'Andika Eng-Lit', writingSystem: { tag: 'en' } });
    expect(resolution).toEqual({
      requestedFont: 'Andika Eng-Lit',
      resolution: 'near_match_specified_font',
      family: 'Andika',
      url: FONT_FACE_DEFINITIONS['Andika']
    });
  });

  it('can resolve writing_system_default and take region into account', () => {
    let resolution = fontResolver.resolveFont({ defaultFont: 'Unknown font', writingSystem: { tag: 'unk-Arab' } });
    expect(resolution).toEqual({
      requestedFont: 'Unknown font',
      resolution: 'writing_system_default',
      family: 'Scheherazade New',
      url: FONT_FACE_DEFINITIONS['Scheherazade New']
    });
    resolution = fontResolver.resolveFont({ defaultFont: 'Unknown font', writingSystem: { tag: 'unk-Arab-NE' } });
    expect(resolution).toEqual({
      requestedFont: 'Unknown font',
      resolution: 'writing_system_default',
      family: 'Harmattan',
      url: FONT_FACE_DEFINITIONS['Harmattan']
    });
  });

  it('can fall back to the default font', () => {
    const resolution = fontResolver.resolveFont({ defaultFont: 'Unknown font', writingSystem: { tag: 'unk' } });
    expect(resolution).toEqual({
      requestedFont: 'Unknown font',
      resolution: 'default_font',
      family: 'Charis SIL',
      url: FONT_FACE_DEFINITIONS['Charis SIL']
    });
  });
});

function spec(font?: string): { defaultFont?: string; writingSystem: { tag: string } } {
  return { defaultFont: font, writingSystem: { tag: 'en' } };
}

describe('FontService', () => {
  let fontService: FontService;

  beforeEach(() => {
    fontService = new FontService(new FakeDocument() as any);
  });

  it('should default to Charis SIL when font is not specified', () => {
    mockedConsole.expectAndHide(/No font definition for /);
    expect(fontService.getFontFamilyFromProject(spec(undefined))).toEqual('Charis SIL');
    expect(fontService.getFontFamilyFromProject(spec(''))).toEqual('Charis SIL');
    mockedConsole.verify();
    mockedConsole.reset();
  });

  it('should default to Charis SIL when font is not recognized', () => {
    mockedConsole.expectAndHide(/No font definition for zyz123/);
    expect(fontService.getFontFamilyFromProject(spec('zyz123'))).toEqual('Charis SIL');
    mockedConsole.verify();
    mockedConsole.reset();
  });

  it('should default to Charis SIL for proprietary serif fonts', () => {
    mockedConsole.expectAndHide(/No font definition for /);
    expect(fontService.getFontFamilyFromProject(spec('Times New Roman'))).toEqual('Charis SIL');
    expect(fontService.getFontFamilyFromProject(spec('Cambria'))).toEqual('Charis SIL');
    expect(fontService.getFontFamilyFromProject(spec('Sylfaen'))).toEqual('Charis SIL');
    mockedConsole.verify();
    mockedConsole.reset();
  });

  it('should default to Andika for proprietary sans-serif fonts', () => {
    mockedConsole.expectAndHide(/No font definition for /);
    expect(fontService.getFontFamilyFromProject(spec('Arial'))).toEqual('Andika');
    expect(fontService.getFontFamilyFromProject(spec('Verdana'))).toEqual('Andika');
    expect(fontService.getFontFamilyFromProject(spec('Tahoma'))).toEqual('Andika');
    mockedConsole.verify();
    mockedConsole.reset();
  });

  it('should fall back from Annapurna SIL Thami to Annapurna SIL', () => {
    mockedConsole.expectAndHide(/No font definition for /);
    expect(fontService.getFontFamilyFromProject(spec('Annapurna SIL Thami'))).toEqual('Annapurna SIL');
    mockedConsole.verify();
  });

  it('should not have any broken font fallbacks', () => {
    // make sure all fallbacks are actually defined
    expect(Object.values(FONT_FACE_FALLBACKS).filter(fallback => FONT_FACE_DEFINITIONS[fallback] == null)).toEqual([]);
  });

  it('should only load each font once', () => {
    fontService.getFontFamilyFromProject(spec('Charis SIL'));
    fontService.getFontFamilyFromProject(spec('Charis SIL'));
    fontService.getFontFamilyFromProject(spec('Charis SIL'));

    expect(((fontService as any).document as FakeDocument).addCount).toEqual(1);
  });

  it("should default to the specified writing system's default font", () => {
    mockedConsole.expectAndHide(/No font definition for /);
    const tagToExpectedFont = {
      'aaa-Arab-NE': 'Harmattan',
      // This should Awami Nastaliq, but non-Graphite browsers have to fall back to Scheherazade New
      'aaa-Arab-PK': 'Scheherazade New',
      'aaa-Arab': 'Scheherazade New',
      'aaa-Deva-IN': 'Annapurna SIL'
    };

    for (const [tag, font] of Object.entries(tagToExpectedFont)) {
      expect(fontService.getFontFamilyFromProject({ defaultFont: 'Unknown font', writingSystem: { tag } })).toEqual(
        font
      );
    }
    mockedConsole.verify();
    mockedConsole.reset();
  });
});
