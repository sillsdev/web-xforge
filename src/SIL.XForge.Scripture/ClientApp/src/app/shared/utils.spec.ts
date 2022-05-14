import { SFProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { DeltaOperation } from 'rich-text';
import { SelectableProject } from '../core/paratext.service';
import { compareProjectsForSorting, isBadDelta, projectLabel } from './utils';

describe('shared utils', () => {
  describe('projectLabel function', () => {
    const shortName = 'SN';
    const name = 'Name';

    it('should use nothing if project is undefined', () => {
      const label = projectLabel(undefined);
      expect(label).toEqual('');
    });

    it('should use nothing if project has no name or shortName', () => {
      const label = projectLabel({} as SelectableProject);
      expect(label).toEqual('');
    });

    it('should use shortName only if project has no name', () => {
      const label = projectLabel({ shortName } as SelectableProject);
      expect(label).toEqual(shortName);
    });

    it('should use name only if project has no shortName', () => {
      const label = projectLabel({ name } as SelectableProject);
      expect(label).toEqual(name);
    });

    it('should use both if project has both', () => {
      const label = projectLabel({ name, shortName } as SelectableProject);
      expect(label).toEqual(shortName + ' - ' + name);
    });
  });

  describe('isBadDelta function', () => {
    it('requires op.insert to be a string or object', () => {
      expect(isBadDelta([{}])).toBeTrue();
      expect(isBadDelta([{ insert: null }])).toBeTrue();
      expect(isBadDelta([{ insert: 1 }])).toBeTrue();
      // this isn't actually a good op, but isBadDelta won't see a problem with it
      // it's looking for known issues, not proving validity
      expect(isBadDelta([{ insert: {} }])).toBeFalse();
    });

    it('requires that there be an insert', () => {
      expect(isBadDelta([{ thisIsNotAnInsert: 1 } as DeltaOperation])).toBeTrue();
    });

    it('rejects delete and retain ops', () => {
      expect(isBadDelta([{ insert: 'text' }, { delete: 100 }])).toBeTrue();
      expect(isBadDelta([{ insert: 'text' }, { retain: 1 }])).toBeTrue();
      expect(isBadDelta([{ insert: 'text' }, { delete: 100 }, { retain: 1 }])).toBeTrue();
    });

    it('does not allow op.insert.verse to be a non object', () => {
      // op.insert.verse does not have to exist
      expect(isBadDelta([{ insert: {} }])).toBeFalse();
      // but if it does, it has to be an object
      expect(isBadDelta([{ insert: { verse: true } }])).toBeTrue();
      expect(isBadDelta([{ insert: { verse: { number: '2', style: 'v' } } }])).toBeFalse();
    });

    it('requires attributes.segment to not contain null or undefined', () => {
      expect(isBadDelta([{ insert: 'text', attributes: { segment: 'verse_1_1' } }])).toBeFalse();
      expect(isBadDelta([{ insert: 'text', attributes: { segment: 'verse_1_null' } }])).toBeTrue();
      expect(isBadDelta([{ insert: 'text', attributes: { segment: 'verse_1_undefined' } }])).toBeTrue();
    });

    it('does not allow multiple chapter inserts', () => {
      const chapterInsert = { insert: { chapter: { number: '1', style: 'c' } } };
      expect(isBadDelta([])).toBeFalse();
      expect(isBadDelta([chapterInsert])).toBeFalse();
      expect(isBadDelta([chapterInsert, chapterInsert])).toBeTrue();
    });
  });

  it('compares projects for sorting', () => {
    const projects = [{ shortName: 'bbb' }, { shortName: 'CCC' }, { shortName: 'AAA' }] as SFProject[];
    projects.sort(compareProjectsForSorting);
    expect(projects.map(project => project.shortName)).toEqual(['AAA', 'bbb', 'CCC']);
  });
});
