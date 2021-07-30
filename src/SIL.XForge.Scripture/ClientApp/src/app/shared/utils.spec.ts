import { SelectableProject } from '../core/paratext.service';
import { projectLabel } from './utils';

describe('Utils', () => {
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
});
