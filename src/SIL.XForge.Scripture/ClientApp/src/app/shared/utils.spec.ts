import { SelectableProject } from '../core/paratext.service';
import { isDocCorrupted, projectLabel } from './utils';

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
      expect(isDocCorrupted([{}])).toBeTrue();
      expect(isDocCorrupted([{ insert: null }])).toBeTrue();
      expect(isDocCorrupted([{ insert: 1 }])).toBeTrue();
      // this isn't actually a good op, but isDocCorrupted won't see a problem with it
      // it's looking for known issues, not proving validity
      expect(isDocCorrupted([{ insert: {} }])).toBeFalse();
    });

    it('requires that there be an insert', () => {
      expect(isDocCorrupted([{ thisIsNotAnInsert: 1 }])).toBeTrue();
    });

    it('rejects delete and retain ops', () => {
      expect(isDocCorrupted([{ insert: 'text' }, { delete: 100 }])).toBeTrue();
      expect(isDocCorrupted([{ insert: 'text' }, { retain: 1 }])).toBeTrue();
      expect(isDocCorrupted([{ insert: 'text' }, { delete: 100 }, { retain: 1 }])).toBeTrue();
    });

    it('does not allow op.insert.verse to be a non object', () => {
      // op.insert.verse does not have to exist
      expect(isDocCorrupted([{ insert: {} }])).toBeFalse();
      // but if it does, it has to be an object
      expect(isDocCorrupted([{ insert: { verse: true } }])).toBeTrue();
      expect(isDocCorrupted([{ insert: { verse: { number: '2', style: 'v' } } }])).toBeFalse();
    });

    it('requires attributes.segment to not contain null or undefined', () => {
      expect(isDocCorrupted([{ insert: 'text', attributes: { segment: 'verse_1_1' } }])).toBeFalse();
      expect(isDocCorrupted([{ insert: 'text', attributes: { segment: 'verse_1_null' } }])).toBeTrue();
      expect(isDocCorrupted([{ insert: 'text', attributes: { segment: 'verse_1_undefined' } }])).toBeTrue();
    });
  });
});
