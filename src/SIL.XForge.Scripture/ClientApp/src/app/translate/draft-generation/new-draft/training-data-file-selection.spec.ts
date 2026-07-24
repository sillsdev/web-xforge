import { defaultSelectedTrainingDataFiles } from './training-data-file-selection';

describe('defaultSelectedTrainingDataFiles', () => {
  describe('when the available set was recorded last time (new format)', () => {
    it('keeps files that were used last time and are still present', () => {
      const result = defaultSelectedTrainingDataFiles(['a', 'b', 'c'], ['a', 'c'], ['a', 'b', 'c']);
      expect(result).toEqual(['a', 'c']);
    });

    it('selects newly added files (present now, not offered last time)', () => {
      // 'd' is new (was not available at the last build), so it defaults to selected alongside the prior selection
      const result = defaultSelectedTrainingDataFiles(['a', 'b', 'c', 'd'], ['a'], ['a', 'b', 'c']);
      expect(result).toEqual(['a', 'd']);
    });

    it('leaves files that were offered but not used last time deselected', () => {
      // 'b' was available last time but not selected → it was deliberately deselected, so it stays off
      const result = defaultSelectedTrainingDataFiles(['a', 'b'], ['a'], ['a', 'b']);
      expect(result).toEqual(['a']);
    });

    it('drops previously selected files that no longer exist', () => {
      const result = defaultSelectedTrainingDataFiles(['a'], ['a', 'z'], ['a', 'z']);
      expect(result).toEqual(['a']);
    });

    it('treats an empty recorded available set as "everything is new" (all selected)', () => {
      const result = defaultSelectedTrainingDataFiles(['a', 'b'], [], []);
      expect(result).toEqual(['a', 'b']);
    });

    it('preserves the current-file ordering', () => {
      const result = defaultSelectedTrainingDataFiles(['c', 'a', 'b'], ['a', 'b', 'c'], ['a', 'b', 'c']);
      expect(result).toEqual(['c', 'a', 'b']);
    });
  });

  describe('legacy fallback (available set not recorded)', () => {
    it('follows the last selection when one exists', () => {
      // lastAvailable undefined → cannot detect new files; respect the last selection as-is
      const result = defaultSelectedTrainingDataFiles(['a', 'b', 'c'], ['a', 'c'], undefined);
      expect(result).toEqual(['a', 'c']);
    });

    it('does not auto-select newly added files when there is a prior selection', () => {
      const result = defaultSelectedTrainingDataFiles(['a', 'b', 'c'], ['a'], undefined);
      expect(result).toEqual(['a']);
    });

    it('selects everything when there is no prior selection at all', () => {
      const result = defaultSelectedTrainingDataFiles(['a', 'b'], [], undefined);
      expect(result).toEqual(['a', 'b']);
    });

    it('selects everything when the prior selection is also undefined', () => {
      const result = defaultSelectedTrainingDataFiles(['a', 'b'], undefined, undefined);
      expect(result).toEqual(['a', 'b']);
    });
  });

  it('returns an empty list when there are no current files', () => {
    expect(defaultSelectedTrainingDataFiles([], ['a'], ['a'])).toEqual([]);
    expect(defaultSelectedTrainingDataFiles([], undefined, undefined)).toEqual([]);
  });
});
