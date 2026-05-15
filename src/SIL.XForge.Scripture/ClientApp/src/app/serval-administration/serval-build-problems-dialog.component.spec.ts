import {
  ServalBuildProblemsDialog,
  ServalBuildProblemsDialogData,
  ServalBuildProblemsDialogSection
} from './serval-build-problems-dialog.component';
import { BuildReportProblem } from './serval-build-report';

describe('ServalBuildProblemsDialog', () => {
  const problemsHeader: string = '# Problems with Serval build ID build-id';
  const sfErrorsHeader: string = '## SF errors';
  const sfFailureItem: string = '- SF failure';
  const sfWarningsHeader: string = '## SF warnings';
  const servalErrorsHeader: string = '## Serval errors';
  const servalWarningsHeader: string = '## Serval warnings';
  const servalWarningItem: string = '- Low confidence';
  const noneReportedIndication: string = 'None reported';

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

    expect(result).toContain(problemsHeader);
    expect(result).toContain(sfErrorsHeader);
    expect(result).toContain(sfFailureItem);
    expect(result).toContain(servalWarningsHeader);
    expect(result).toContain(servalWarningItem);
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

    expect(result).not.toContain(sfErrorsHeader);
    expect(result).toContain(sfWarningsHeader);
    expect(result).not.toContain(servalErrorsHeader);
    expect(result).toContain(servalWarningsHeader);
    expect(result).not.toContain(noneReportedIndication);
  });
});
