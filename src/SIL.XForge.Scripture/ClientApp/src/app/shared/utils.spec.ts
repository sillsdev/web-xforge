import { SFProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { DeltaOperation } from 'rich-text';
import { SelectableProject } from '../core/paratext.service';
import { compareProjectsForSorting, containsInvalidOp, projectLabel } from './utils';

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

  describe('isDocCorrupted function', () => {
    it('requires op.insert to be a string or object', () => {
      expect(containsInvalidOp([{}])).toBeTrue();
      expect(containsInvalidOp([{ insert: null }])).toBeTrue();
      expect(containsInvalidOp([{ insert: 1 }])).toBeTrue();
      // this isn't actually a good op, but isDocCorrupted won't see a problem with it
      // it's looking for known issues, not proving validity
      expect(containsInvalidOp([{ insert: {} }])).toBeFalse();
    });

    it('requires that there be an insert', () => {
      expect(containsInvalidOp([{ thisIsNotAnInsert: 1 } as DeltaOperation])).toBeTrue();
    });

    it('rejects delete and retain ops', () => {
      expect(containsInvalidOp([{ insert: 'text' }, { delete: 100 }])).toBeTrue();
      expect(containsInvalidOp([{ insert: 'text' }, { retain: 1 }])).toBeTrue();
      expect(containsInvalidOp([{ insert: 'text' }, { delete: 100 }, { retain: 1 }])).toBeTrue();
    });

    it('does not allow op.insert.verse to be a non object', () => {
      // op.insert.verse does not have to exist
      expect(containsInvalidOp([{ insert: {} }])).toBeFalse();
      // but if it does, it has to be an object
      expect(containsInvalidOp([{ insert: { verse: true } }])).toBeTrue();
      expect(containsInvalidOp([{ insert: { verse: { number: '2', style: 'v' } } }])).toBeFalse();
    });

    it('requires attributes.segment to not contain null or undefined', () => {
      expect(containsInvalidOp([{ insert: 'text', attributes: { segment: 'verse_1_1' } }])).toBeFalse();
      expect(containsInvalidOp([{ insert: 'text', attributes: { segment: 'verse_1_null' } }])).toBeTrue();
      expect(containsInvalidOp([{ insert: 'text', attributes: { segment: 'verse_1_undefined' } }])).toBeTrue();
    });
  });

  it('compares projects for sorting', () => {
    const projects = [{ shortName: 'BBB' }, { shortName: 'AAA' }] as SFProject[];
    projects.sort(compareProjectsForSorting);
    expect(projects[0].shortName).toBe('AAA');
  });
});
