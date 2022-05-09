import { SFProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { compareProjectsForSorting, getAspCultureCookieLanguage, getLinkHTML } from './utils';

describe('xforge-common utils', () => {
  it('should parse ASP Culture cookie', () => {
    let language = getAspCultureCookieLanguage('c=ab');
    expect(language).toEqual('ab');

    language = getAspCultureCookieLanguage('uic=cd');
    expect(language).toEqual('cd');

    language = getAspCultureCookieLanguage('c=ab|uic=cd');
    expect(language).toEqual('cd');

    language = getAspCultureCookieLanguage('uic=cd|c=ab');
    expect(language).toEqual('cd');

    language = getAspCultureCookieLanguage('');
    expect(language).toEqual('en');
  });

  it('should correctly generate links', () => {
    expect(getLinkHTML('example', 'https://example.com')).toEqual(
      `<a href="https://example.com" target="_blank">example</a>`
    );
  });

  it('compares projects for sorting', () => {
    const projects = [{ shortName: 'BBB' }, { shortName: 'AAA' }] as SFProject[];
    projects.sort(compareProjectsForSorting);
    expect(projects[0].shortName).toBe('AAA');
  });
});
