import { TestBed } from '@angular/core/testing';
import { provideNativeDateAdapter } from '@angular/material/core';
import { getTestTranslocoModule } from 'xforge-common/test-utils';
import { DraftJobsExportService, SpreadsheetRow } from './draft-jobs-export.service';

describe('DraftJobsExportService', () => {
  describe('createSpreadsheetRows', () => {
    it('should export with correct headers and data', () => {
      const env = new TestEnvironment();
      const spreadsheetRows: SpreadsheetRow[] = (env.service as any).createSpreadsheetRows([
        {
          job: {
            buildId: 'build-123',
            startTime: new Date('2025-01-15T10:00:00Z'),
            finishTime: new Date('2025-01-15T11:00:00Z'),
            duration: 3600000 // 1 hour in milliseconds
          },
          projectId: 'project1',
          projectName: 'Test Project',
          status: 'Success',
          userId: 'user123',
          trainingBooks: [{ projectId: 'project1', books: ['GEN'] }],
          translationBooks: [{ projectId: 'project1', books: ['MAT'] }]
        }
      ]);

      expect(spreadsheetRows.length).toEqual(1);
      expect(spreadsheetRows[0]).toEqual({
        servalBuildId: 'build-123',
        startTime: '2025-01-15T10:00:00.000Z',
        endTime: '2025-01-15T11:00:00.000Z',
        durationMinutes: '60',
        status: 'Success',
        sfProjectId: 'project1',
        projectName: 'Test Project',
        sfUserId: 'user123',
        trainingBooks: 'project1: GEN',
        translationBooks: 'project1: MAT'
      });
    });
  });

  describe('createSpreadsheetRowsWithStatistics', () => {
    it('should append blank row and statistics rows with mean and max duration', () => {
      const env = new TestEnvironment();
      const testRows = [
        {
          job: {
            buildId: 'build-1',
            startTime: new Date('2025-01-15T10:00:00Z'),
            finishTime: new Date('2025-01-15T10:30:00Z'),
            duration: 1800000 // 30 minutes in milliseconds
          },
          projectId: 'project1',
          projectName: 'Project 1',
          status: 'Success',
          userId: 'user1',
          trainingBooks: [],
          translationBooks: []
        },
        {
          job: {
            buildId: 'build-2',
            startTime: new Date('2025-01-15T11:00:00Z'),
            finishTime: new Date('2025-01-15T12:00:00Z'),
            duration: 3600000 // 60 minutes in milliseconds
          },
          projectId: 'project1',
          projectName: 'Project 1',
          status: 'Success',
          userId: 'user2',
          trainingBooks: [],
          translationBooks: []
        }
      ];

      // SUT: create rows with the test data
      const spreadsheetRows: SpreadsheetRow[] = (env.service as any).createSpreadsheetRowsWithStatistics(
        testRows,
        2700000,
        3600000
      );

      // Should have 2 data rows + 1 blank row + 2 statistics rows = 5 total
      expect(spreadsheetRows.length).toEqual(5);

      // Check blank row (index 2)
      expect(spreadsheetRows[2].status).toBe('');
      expect(spreadsheetRows[2].sfProjectId).toBe('');

      // Check mean duration row (index 3) - (30 + 60) / 2 = 45 minutes
      // Label in servalBuildId, value in startTime
      expect(spreadsheetRows[3].servalBuildId).toBe('Mean duration minutes');
      expect(spreadsheetRows[3].startTime).toBe('45');

      // Check max duration row (index 4) - max(30, 60) = 60 minutes
      // Label in servalBuildId, value in startTime
      expect(spreadsheetRows[4].servalBuildId).toBe('Max duration minutes');
      expect(spreadsheetRows[4].startTime).toBe('60');
    });

    it('should handle empty rows array', () => {
      const env = new TestEnvironment();
      // SUT
      const spreadsheetRows: SpreadsheetRow[] = (env.service as any).createSpreadsheetRowsWithStatistics([], 0, 0);

      // Should have only blank row + 2 statistics rows = 3 total
      expect(spreadsheetRows.length).toEqual(3);

      // Check statistics are 0 when no data
      // Label in servalBuildId, value in startTime
      expect(spreadsheetRows[1].servalBuildId).toBe('Mean duration minutes');
      expect(spreadsheetRows[1].startTime).toBe('0');

      expect(spreadsheetRows[2].servalBuildId).toBe('Max duration minutes');
      expect(spreadsheetRows[2].startTime).toBe('0');
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
