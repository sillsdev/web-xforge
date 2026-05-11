import {
  ServalBuildProblemsDialog,
  ServalBuildProblemsDialogData,
  ServalBuildProblemsDialogSection
} from './serval-build-problems-dialog.component';
import { BuildReportProblem } from './serval-build-report';

describe('ServalBuildProblemsDialog', () => {
  function createSection(heading: string, problems: BuildReportProblem[]): ServalBuildProblemsDialogSection {
    return { heading: heading, problems: problems };
  }

  function createDialog(data: ServalBuildProblemsDialogData): ServalBuildProblemsDialog {
    return new ServalBuildProblemsDialog(data);
  }

  it('sectionCopyValue returns section list entries with dash prefix', () => {
    const section: ServalBuildProblemsDialogSection = createSection('Serval warnings', [
      { source: 'serval', severity: 'warning', message: 'Low confidence' },
      { source: 'serval', severity: 'warning', message: 'Missing data' }
    ]);

    const dialog: ServalBuildProblemsDialog = createDialog({ servalBuildId: 'build-id', sections: [section] });

    expect(dialog.sectionCopyValue(section)).toBe('- Low confidence\n- Missing data');
  });

  it('copyAllValue returns full markdown content with title and sections', () => {
    const dialog: ServalBuildProblemsDialog = createDialog({
      servalBuildId: 'build-id',
      sections: [
        createSection('SF errors', [{ source: 'local', severity: 'error', message: 'SF failure' }]),
        createSection('Serval warnings', [{ source: 'serval', severity: 'warning', message: 'Low confidence' }])
      ]
    });

    const result: string = dialog.copyAllValue;

    expect(result).toContain('# Problems with Serval build ID build-id');
    expect(result).toContain('## SF errors');
    expect(result).toContain('- SF failure');
    expect(result).toContain('## Serval warnings');
    expect(result).toContain('- Low confidence');
  });

  it('copyAllValue omits sections that have no problems', () => {
    const dialog: ServalBuildProblemsDialog = createDialog({
      servalBuildId: 'build-id',
      sections: [
        createSection('SF errors', []),
        createSection('SF warnings', [{ source: 'local', severity: 'warning', message: 'Minor issue' }]),
        createSection('Serval errors', []),
        createSection('Serval warnings', [{ source: 'serval', severity: 'warning', message: 'Low confidence' }])
      ]
    });

    const result: string = dialog.copyAllValue;

    expect(result).not.toContain('## SF errors');
    expect(result).toContain('## SF warnings');
    expect(result).not.toContain('## Serval errors');
    expect(result).toContain('## Serval warnings');
    expect(result).not.toContain('None reported');
  });
});
