import { FontService } from './xforge-common/font.service';

describe('FontService', () => {
  let fontService: FontService;

  beforeEach(() => {
    fontService = new FontService();
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
    expect(fontService.getBrokenFontFallbacks()).toEqual([]);
  });
});
