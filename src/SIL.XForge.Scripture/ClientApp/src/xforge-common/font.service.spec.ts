import { FontService, FONT_FACE_DEFINITIONS, FONT_FACE_FALLBACKS } from './font.service';

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

describe('FontService', () => {
  let fontService: FontService;

  beforeEach(() => {
    fontService = new FontService(new FakeDocument() as any);
  });

  it('should default to Charis SIL when font is not specified', () => {
    expect(fontService.getCSSFontName(undefined)).toEqual('Charis SIL');
    expect(fontService.getCSSFontName('')).toEqual('Charis SIL');
  });

  it('should default to Charis SIL when font is not recognized', () => {
    expect(fontService.getCSSFontName('zyz123')).toEqual('Charis SIL');
  });

  it('should default to Charis SIL for proprietary serif fonts', () => {
    expect(fontService.getCSSFontName('Times New Roman')).toEqual('Charis SIL');
    expect(fontService.getCSSFontName('Cambria')).toEqual('Charis SIL');
    expect(fontService.getCSSFontName('Sylfaen')).toEqual('Charis SIL');
  });

  it('should default to Andika for proprietary sans-serif fonts', () => {
    expect(fontService.getCSSFontName('Arial')).toEqual('Andika');
    expect(fontService.getCSSFontName('Verdana')).toEqual('Andika');
    expect(fontService.getCSSFontName('Tahoma')).toEqual('Andika');
  });

  it('should fall back from Annapurna SIL Nepal to Annapurna SIL', () => {
    expect(fontService.getCSSFontName('Annapurna SIL Nepal')).toEqual('Annapurna SIL');
  });

  it('should not have any broken font fallbacks', () => {
    // make sure all fallbacks are actually defined
    expect(Object.values(FONT_FACE_FALLBACKS).filter(fallback => FONT_FACE_DEFINITIONS[fallback] == null)).toEqual([]);
  });

  it('should only load each font once', () => {
    fontService.getCSSFontName('Charis SIL');
    fontService.getCSSFontName('Charis SIL');
    fontService.getCSSFontName('Charis SIL');

    expect(((fontService as any).document as FakeDocument).addCount).toEqual(1);
  });
});
