import { TestBed } from '@angular/core/testing';
import { provideNativeDateAdapter } from '@angular/material/core';
import { getTestTranslocoModule } from 'xforge-common/test-utils';
import { DraftJobsExportService, SpreadsheetRow } from './draft-jobs-export.service';

describe('DraftJobsExportService', () => {
  describe('addStatistics', () => {
    it('should append blank row and statistics rows with mean and max duration', () => {
      const env = new TestEnvironment();
      const testRows: SpreadsheetRow[] = [
        {
          servalBuildId: 'build-1',
          startTime: '2025-01-15T10:00:00.000Z',
          endTime: '2025-01-15T10:30:00.000Z',
          durationMinutes: '30',
          status: 'Success',
          sfProjectId: 'project1',
          projectName: 'Project 1',
          sfUserId: 'user1',
          trainingBooks: '',
          translationBooks: ''
        },
        {
          servalBuildId: 'build-2',
          startTime: '2025-01-15T11:00:00.000Z',
          endTime: '2025-01-15T12:00:00.000Z',
          durationMinutes: '60',
          status: 'Success',
          sfProjectId: 'project1',
          projectName: 'Project 1',
          sfUserId: 'user2',
          trainingBooks: '',
          translationBooks: ''
        }
      ];

      // SUT: create rows with the test data
      const spreadsheetRows: SpreadsheetRow[] = (env.service as any).addStatistics(testRows, 2700000, 3600000);

      // Should have 2 data rows + 1 blank row + 2 statistics rows = 5 total
      expect(spreadsheetRows.length).toEqual(5);

      // Check blank row (index 2)
      expect(spreadsheetRows[2].status).toBe('');
      expect(spreadsheetRows[2].sfProjectId).toBe('');

      // Check mean duration row (index 3) - (30 + 60) / 2 = 45 minutes
      // Label in servalBuildId, value in startTime
      expect(spreadsheetRows[3].servalBuildId).toMatch(/Mean/);
      expect(spreadsheetRows[3].startTime).toBe('45');

      // Check max duration row (index 4) - max(30, 60) = 60 minutes
      // Label in servalBuildId, value in startTime
      expect(spreadsheetRows[4].servalBuildId).toMatch(/Max/);
      expect(spreadsheetRows[4].startTime).toBe('60');
    });

    it('should handle empty rows array', () => {
      const env = new TestEnvironment();
      // SUT
      const spreadsheetRows: SpreadsheetRow[] = (env.service as any).addStatistics([], 0, 0);

      // Should have only blank row + 2 statistics rows = 3 total
      expect(spreadsheetRows.length).toEqual(3);

      // Check statistics are 0 when no data
      // Label in servalBuildId, value in startTime
      expect(spreadsheetRows[1].servalBuildId).toMatch(/Mean/);
      expect(spreadsheetRows[1].startTime).toBe('0');

      expect(spreadsheetRows[2].servalBuildId).toMatch(/Max/);
      expect(spreadsheetRows[2].startTime).toBe('0');
    });
  });

  describe('getExportFilename', () => {
    it('should use the provided filename prefix', () => {
      const env = new TestEnvironment();
      const dateRange = { start: new Date(2025, 0, 15), end: new Date(2025, 1, 28) };

      const filename: string = (env.service as any).getExportFilename(dateRange, 'csv', 'my-prefix');
      expect(filename).toBe('my-prefix_2025-01-15_2025-02-28.csv');
    });
  });
});

class TestEnvironment {
  readonly service: DraftJobsExportService;

  constructor() {
    TestBed.configureTestingModule({
      imports: [getTestTranslocoModule()],
      providers: [provideNativeDateAdapter(), DraftJobsExportService]
    });
    this.service = TestBed.inject(DraftJobsExportService);
  }
}
