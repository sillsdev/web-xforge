import {
  buildProjectDisplayName,
  BuildReportProjectScriptureRange,
  ProjectBooks,
  toProjectBooks
} from './serval-build-report';

describe('toProjectBooks', () => {
  it('parses semicolon-delimited scripture ranges into book arrays', () => {
    const ranges: BuildReportProjectScriptureRange[] = [
      { sfProjectId: 'p1', scriptureRange: 'GEN;EXO', shortName: 'ABC', name: 'Project ABC' }
    ];

    const result: ProjectBooks[] = toProjectBooks(ranges);

    expect(result.length).toBe(1);
    expect(result[0].sfProjectId).toBe('p1');
    expect(result[0].projectDisplayName).toBe('ABC - Project ABC');
    expect(result[0].books).toEqual(['GEN', 'EXO']);
  });

  it('handles a single-book range', () => {
    const ranges: BuildReportProjectScriptureRange[] = [
      { sfProjectId: 'p1', scriptureRange: 'MAT', shortName: 'DEF', name: undefined }
    ];

    const result: ProjectBooks[] = toProjectBooks(ranges);

    expect(result.length).toBe(1);
    expect(result[0].books).toEqual(['MAT']);
  });

  it('handles multiple project ranges with different projects', () => {
    const ranges: BuildReportProjectScriptureRange[] = [
      { sfProjectId: 'p1', scriptureRange: 'GEN;EXO', shortName: 'SRC', name: 'Source' },
      { sfProjectId: 'p2', scriptureRange: 'MAT;MRK;LUK', shortName: 'TRN', name: 'Training' }
    ];

    const result: ProjectBooks[] = toProjectBooks(ranges);

    expect(result.length).toBe(2);
    expect(result[0].sfProjectId).toBe('p1');
    expect(result[0].projectDisplayName).toBe('SRC - Source');
    expect(result[0].books).toEqual(['GEN', 'EXO']);
    expect(result[1].sfProjectId).toBe('p2');
    expect(result[1].projectDisplayName).toBe('TRN - Training');
    expect(result[1].books).toEqual(['MAT', 'MRK', 'LUK']);
  });

  it('returns empty array for undefined ranges', () => {
    const result: ProjectBooks[] = toProjectBooks(undefined);

    expect(result).toEqual([]);
  });

  it('skips null entries in the ranges array', () => {
    const ranges: BuildReportProjectScriptureRange[] = [
      null as any,
      { sfProjectId: 'p1', scriptureRange: 'GEN', shortName: 'PRJ', name: undefined }
    ];

    const result: ProjectBooks[] = toProjectBooks(ranges);

    expect(result.length).toBe(1);
    expect(result[0].sfProjectId).toBe('p1');
  });

  it('skips entries with undefined sfProjectId', () => {
    const ranges: BuildReportProjectScriptureRange[] = [
      { sfProjectId: undefined as any, scriptureRange: 'GEN', shortName: 'PRJ', name: undefined }
    ];

    const result: ProjectBooks[] = toProjectBooks(ranges);

    expect(result).toEqual([]);
  });

  it('skips entries with undefined scriptureRange', () => {
    const ranges: BuildReportProjectScriptureRange[] = [
      { sfProjectId: 'p1', scriptureRange: undefined as any, shortName: 'PRJ', name: undefined }
    ];

    const result: ProjectBooks[] = toProjectBooks(ranges);

    expect(result).toEqual([]);
  });

  it('falls back to sfProjectId when shortName and name are both undefined', () => {
    const ranges: BuildReportProjectScriptureRange[] = [
      { sfProjectId: 'p1', scriptureRange: 'GEN', shortName: undefined, name: undefined }
    ];

    const result: ProjectBooks[] = toProjectBooks(ranges);

    expect(result[0].projectDisplayName).toBe('p1');
  });

  it('trims whitespace from book identifiers', () => {
    const ranges: BuildReportProjectScriptureRange[] = [
      { sfProjectId: 'p1', scriptureRange: ' GEN ; EXO ', shortName: 'PRJ', name: undefined }
    ];

    const result: ProjectBooks[] = toProjectBooks(ranges);

    expect(result[0].books).toEqual(['GEN', 'EXO']);
  });

  it('filters out empty tokens from trailing semicolons', () => {
    const ranges: BuildReportProjectScriptureRange[] = [
      { sfProjectId: 'p1', scriptureRange: 'GEN;EXO;', shortName: 'PRJ', name: undefined }
    ];

    const result: ProjectBooks[] = toProjectBooks(ranges);

    expect(result[0].books).toEqual(['GEN', 'EXO']);
  });
});

describe('buildProjectDisplayName', () => {
  it('shows shortName - name when both are available', () => {
    expect(buildProjectDisplayName('ABC', 'My Project', 'p1')).toBe('ABC - My Project');
  });

  it('shows just shortName when name is undefined', () => {
    expect(buildProjectDisplayName('ABC', undefined, 'p1')).toBe('ABC');
  });

  it('shows just name when shortName is undefined', () => {
    expect(buildProjectDisplayName(undefined, 'My Project', 'p1')).toBe('My Project');
  });

  it('falls back to projectId when both shortName and name are undefined', () => {
    expect(buildProjectDisplayName(undefined, undefined, 'p1')).toBe('p1');
  });

  it('falls back to Unknown when everything is undefined', () => {
    expect(buildProjectDisplayName(undefined, undefined, undefined)).toBe('Unknown project');
  });
});
