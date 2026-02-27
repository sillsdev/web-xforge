import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { BehaviorSubject } from 'rxjs';
import { anything, instance, mock, when } from 'ts-mockito';
import { DialogService } from 'xforge-common/dialog.service';
import { UserProfileDoc } from 'xforge-common/models/user-profile-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { MockConsole } from 'xforge-common/mock-console';
import { provideTestOnlineStatus } from 'xforge-common/test-online-status-providers';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { provideTestRealtime } from 'xforge-common/test-realtime-providers';
import { configureTestingModule, getTestTranslocoModule } from 'xforge-common/test-utils';
import { UserService } from 'xforge-common/user.service';
import { SF_TYPE_REGISTRY } from '../core/models/sf-type-registry';
import { BuildDto } from '../machine-api/build-dto';
import { BuildStates } from '../machine-api/build-states';
import { DraftGenerationService } from '../translate/draft-generation/draft-generation.service';
import { NormalizedDateRange } from './date-range-picker.component';
import { DraftJobsExportService, SpreadsheetRow } from './draft-jobs-export.service';
import {
  buildProjectDisplayName,
  BuildReportTimeline,
  DraftGenerationBuildState,
  ProjectBooks,
  ServalBuildReportDto
} from './serval-build-report';
import { buildSummary, gapsBetweenBuildsMs } from './serval-builds-statistics';
import { ServalBuildRow, ServalBuildsComponent, ServalBuildSummary } from './serval-builds.component';

const mockNoticeService = mock(NoticeService);
const mockDraftGenerationService = mock(DraftGenerationService);
const mockDialogService = mock(DialogService);
const mockExportService = mock(DraftJobsExportService);
const mockUserService = mock(UserService);
const mockedConsole: MockConsole = MockConsole.install();

describe('ServalBuildsComponent', () => {
  configureTestingModule(() => ({
    imports: [ServalBuildsComponent, getTestTranslocoModule()],
    providers: [
      provideTestRealtime(SF_TYPE_REGISTRY),
      provideTestOnlineStatus(),
      { provide: NoticeService, useMock: mockNoticeService },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService },
      { provide: DraftGenerationService, useMock: mockDraftGenerationService },
      { provide: DialogService, useMock: mockDialogService },
      { provide: DraftJobsExportService, useMock: mockExportService },
      { provide: UserService, useMock: mockUserService },
      provideNoopAnimations()
    ]
  }));

  describe('include deleted toggle', () => {
    it('excludes deleted projects when toggle is off', () => {
      const env = new TestEnvironment();
      const activeRow = env.createRow(false, 1000);
      const deletedRow = env.createRow(true, 3000);
      env.component['allRows'] = [activeRow, deletedRow];

      // SUT
      env.component['onIncludeDeletedChange'](false);

      expect(env.component['rows'].length).toBe(1);
      expect(env.component['rows'][0].report.project?.sfProjectId).toBeDefined();
    });

    it('includes deleted projects when toggle is on', () => {
      const env = new TestEnvironment();
      const activeRow = env.createRow(false, 1000);
      const deletedRow = env.createRow(true, 3000);
      env.component['allRows'] = [activeRow, deletedRow];

      // SUT
      env.component['onIncludeDeletedChange'](true);

      expect(env.component['rows'].length).toBe(2);
      expect(env.component['rows'][1].report.project?.sfProjectId).toBeUndefined();
    });
  });

  describe('summary stats', () => {
    it('returns undefined average requesters when a requester is missing', () => {
      // Suppose some builds for a project have a record of who requested them, and some builds for that or another
      // project don't. We can't very meaningfully determine the "average" number of requesters per project in this
      // situation. So the average will be undefined.

      const env = new TestEnvironment();
      const baseStart: Date = new Date('2024-01-01T00:00:00Z');
      const rows: any[] = [
        env.createRowWithDetails({
          projectId: 'project-a',
          startDate: env.addHours(baseStart, 0),
          finishDate: env.addHours(baseStart, 1),
          requesterId: 'user-1',
          status: DraftGenerationBuildState.Completed
        }),
        env.createRowWithDetails({
          projectId: 'project-a',
          startDate: env.addHours(baseStart, 2),
          finishDate: env.addHours(baseStart, 3),
          requesterId: undefined,
          status: DraftGenerationBuildState.Completed
        })
      ];

      // SUT
      const summary: {
        totalBuilds: number;
        totalProjects: number;
        totalRequesters: number;
        averageRequestersPerProject?: number;
      } = buildSummary(rows);

      expect(summary.totalBuilds).toBe(2);
      expect(summary.totalProjects).toBe(1);
      expect(summary.totalRequesters).toBe(1);
      expect(summary.averageRequestersPerProject).toBeUndefined();
    });

    it('computes summary statistics from rows', () => {
      const env = new TestEnvironment();
      const baseStart: Date = new Date('2024-01-01T00:00:00Z');

      const rows = [
        env.createRowWithDetails({
          projectId: 'proj-a',
          startDate: env.addHours(baseStart, 0),
          finishDate: env.addHours(baseStart, 1),
          requesterId: 'user-1',
          trainingBooks: env.createProjectBooks('proj-a', ['GEN', 'EXO']),
          translationBooks: env.createProjectBooks('proj-a', ['PSA']),
          status: DraftGenerationBuildState.Completed
        }),
        env.createRowWithDetails({
          projectId: 'proj-a',
          startDate: env.addHours(baseStart, 3),
          finishDate: env.addHours(baseStart, 4),
          requesterId: 'user-2',
          trainingBooks: env.createProjectBooks('proj-a', ['MRK']),
          translationBooks: [],
          status: DraftGenerationBuildState.Completed
        }),
        env.createRowWithDetails({
          projectId: 'proj-a',
          startDate: env.addHours(baseStart, 7),
          finishDate: env.addHours(baseStart, 8),
          requesterId: 'user-2',
          trainingBooks: env.createProjectBooks('proj-a', ['ROM', '1CO', '2CO']),
          translationBooks: env.createProjectBooks('proj-a', ['MAT', 'LUK']),
          problems: ['Low confidence'],
          status: DraftGenerationBuildState.Completed
        }),
        env.createRowWithDetails({
          projectId: 'proj-b',
          startDate: env.addHours(baseStart, 2),
          finishDate: env.addHours(baseStart, 2.5),
          requesterId: 'user-2',
          trainingBooks: [],
          translationBooks: [],
          status: DraftGenerationBuildState.Active
        }),
        env.createRowWithDetails({
          projectId: 'proj-b',
          startDate: env.addHours(baseStart, 5),
          finishDate: env.addHours(baseStart, 6),
          requesterId: 'user-3',
          trainingBooks: env.createProjectBooks('proj-b', ['ACT']),
          translationBooks: env.createProjectBooks('proj-b', ['ISA', 'JER', 'EZE']),
          status: DraftGenerationBuildState.Faulted
        }),
        env.createRowWithDetails({
          projectId: 'proj-c',
          startDate: env.addHours(baseStart, 9),
          finishDate: env.addHours(baseStart, 10),
          trainingBooks: [],
          translationBooks: [],
          status: DraftGenerationBuildState.Pending,
          requesterId: 'user-4'
        }),
        // This build could not be associated with a project. And so it also will not have been associated with a requester.
        env.createRowWithDetails({
          projectId: undefined,
          startDate: env.addHours(baseStart, 11),
          finishDate: env.addHours(baseStart, 12),
          trainingBooks: [],
          translationBooks: [],
          status: DraftGenerationBuildState.Pending,
          requesterId: undefined
        })
      ];

      // SUT
      const summary = buildSummary(rows);

      expect(summary.totalBuilds).toBe(6);
      expect(summary.totalProjects).toBe(3);
      expect(summary.buildsPerProjectRatio).toBeCloseTo(2);
      expect(summary.averageInterBuildTimeMs).toBeCloseTo(9000000);
      expect(summary.totalRequesters).toBe(4);
      expect(summary.averageRequestersPerProject).toBeCloseTo(1.667);
      expect(summary.faultedBuilds).toBe(1);
      expect(summary.averageTrainingBooksPerBuild).toBeCloseTo(1.1666666667);
      expect(summary.averageTranslationBooksPerBuild).toBeCloseTo(1);
      expect(summary.completedBuilds).toBe(3);
      expect(summary.inProgressBuilds).toBe(2);
      expect(summary.buildsWithProblems).toBe(1);
      expect(summary.unconsideredBuilds).toBe(1);
      expect(summary.meanDurationMs).toBe(3600000);
      expect(summary.maxDurationMs).toBe(3600000);
      // All rows created above with createRowWithDetails have a servalBuild and no events, so all are "SF did not know about"
      expect(summary.buildsServalDidNotKnowAbout).toBe(0);
      expect(summary.buildsSfDidNotKnowAbout).toBe(6);
    });

    it('uses only completed builds for mean duration', () => {
      const env = new TestEnvironment();
      const baseStart: Date = new Date('2024-01-01T00:00:00Z');

      const rows = [
        env.createRowWithDetails({
          projectId: 'proj-a',
          startDate: env.addHours(baseStart, 0),
          finishDate: env.addHours(baseStart, 2),
          requesterId: 'user-1',
          status: DraftGenerationBuildState.Completed
        }),
        env.createRowWithDetails({
          projectId: 'proj-a',
          startDate: env.addHours(baseStart, 3),
          finishDate: env.addHours(baseStart, 4),
          requesterId: 'user-1',
          status: DraftGenerationBuildState.Completed
        }),
        env.createRowWithDetails({
          projectId: 'proj-a',
          startDate: env.addHours(baseStart, 5),
          finishDate: env.addHours(baseStart, 10),
          requesterId: 'user-1',
          status: DraftGenerationBuildState.Active
        })
      ];

      // SUT
      const summary = buildSummary(rows);

      // Completed durations: 2h and 1h => mean = 1.5h
      const expectedMeanMs: number = 1.5 * 60 * 60 * 1000;
      expect(summary.meanDurationMs).toBe(expectedMeanMs);
      // Max duration considers all builds including Active (5h), so it should be 5h not 2h
      const expectedMaxMs: number = 5 * 60 * 60 * 1000;
      expect(summary.maxDurationMs).toBe(expectedMaxMs);
    });

    it('computes average requesters per project when each project has one requester', () => {
      // Suppose there are 100 projects, and 1 draft request for each project. So 100 draft requests. Suppose that half
      // of the requests are by one user, and the other half are by another user. The average requesters per project
      // should be 1.

      const env = new TestEnvironment();
      const baseStart: Date = new Date('2024-01-01T00:00:00Z');
      const rows: any[] = [];
      const totalProjects: number = 100;

      for (let index = 0; index < totalProjects; index++) {
        const requesterId: string = index < 50 ? 'user-1' : 'user-2';
        rows.push(
          env.createRowWithDetails({
            projectId: `project-${index}`,
            startDate: env.addHours(baseStart, index * 2),
            finishDate: env.addHours(baseStart, index * 2 + 1),
            requesterId: requesterId,
            status: DraftGenerationBuildState.Completed
          })
        );
      }

      // SUT
      const summary = buildSummary(rows);

      expect(summary.totalBuilds).toBe(100);
      expect(summary.totalProjects).toBe(100);
      expect(summary.totalRequesters).toBe(2);
      expect(summary.averageRequestersPerProject).toBeCloseTo(1);
    });

    it('computes average requesters per project when one project has multiple requesters', () => {
      // Suppose there is 1 project, and 100 build requests for that project. Half of them are requested by 1 person and
      // the other half are requested by another person. The average requesters per project should be 2.

      const env = new TestEnvironment();
      const baseStart: Date = new Date('2024-01-01T00:00:00Z');
      const rows: any[] = [];
      const totalBuilds: number = 100;

      for (let index = 0; index < totalBuilds; index++) {
        const requesterId: string = index < 50 ? 'user-1' : 'user-2';
        rows.push(
          env.createRowWithDetails({
            projectId: 'project-1',
            startDate: env.addHours(baseStart, index * 2),
            finishDate: env.addHours(baseStart, index * 2 + 1),
            requesterId: requesterId,
            status: DraftGenerationBuildState.Completed
          })
        );
      }

      // SUT
      const summary = buildSummary(rows);

      expect(summary.totalBuilds).toBe(100);
      expect(summary.totalProjects).toBe(1);
      expect(summary.totalRequesters).toBe(2);
      expect(summary.averageRequestersPerProject).toBeCloseTo(2);
    });

    it('computes average requesters per project when one project has mixed requesters', () => {
      // Suppose there are 100 build requests. Half are for project A and all are requested by user-1. The other half
      // are for project B, with half requested by user-1 and half by user-2. The average requesters per project should
      // be 1.5.

      const env = new TestEnvironment();
      const baseStart: Date = new Date('2024-01-01T00:00:00Z');
      const rows: any[] = [];
      const totalBuildsPerProject: number = 50;

      for (let index = 0; index < totalBuildsPerProject; index++) {
        rows.push(
          env.createRowWithDetails({
            projectId: 'project-a',
            startDate: env.addHours(baseStart, index * 2),
            finishDate: env.addHours(baseStart, index * 2 + 1),
            requesterId: 'user-1',
            status: DraftGenerationBuildState.Completed
          })
        );
      }

      for (let index = 0; index < totalBuildsPerProject; index++) {
        const requesterId: string = index < 25 ? 'user-1' : 'user-2';
        rows.push(
          env.createRowWithDetails({
            projectId: 'project-b',
            startDate: env.addHours(baseStart, index * 2),
            finishDate: env.addHours(baseStart, index * 2 + 1),
            requesterId: requesterId,
            status: DraftGenerationBuildState.Completed
          })
        );
      }

      // SUT
      const summary = buildSummary(rows);

      expect(summary.totalBuilds).toBe(100);
      expect(summary.totalProjects).toBe(2);
      expect(summary.totalRequesters).toBe(2);
      expect(summary.averageRequestersPerProject).toBeCloseTo(1.5);
    });

    it('excludes events-only builds from book averages calculation', () => {
      const env = new TestEnvironment();
      const baseStart: Date = new Date('2024-01-01T00:00:00Z');

      const rows = [
        // Build with Serval data - has 2 training books and 1 translation book
        env.createRowWithDetails({
          projectId: 'proj-a',
          startDate: env.addHours(baseStart, 0),
          finishDate: env.addHours(baseStart, 1),
          requesterId: 'user-1',
          trainingBooks: env.createProjectBooks('proj-a', ['GEN', 'EXO']),
          translationBooks: env.createProjectBooks('proj-a', ['PSA']),
          status: DraftGenerationBuildState.Completed,
          hasServalBuild: true,
          hasEvents: true
        }),
        // Build with Serval data - has 3 training books and 2 translation books
        env.createRowWithDetails({
          projectId: 'proj-a',
          startDate: env.addHours(baseStart, 2),
          finishDate: env.addHours(baseStart, 3),
          requesterId: 'user-1',
          trainingBooks: env.createProjectBooks('proj-a', ['MRK', 'LUK', 'JHN']),
          translationBooks: env.createProjectBooks('proj-a', ['MAT', 'ROM']),
          status: DraftGenerationBuildState.Completed,
          hasServalBuild: true,
          hasEvents: true
        }),
        // Events-only build - has no Serval data, so no book info is present
        // This should not be counted in the book averages denominator
        env.createRowWithDetails({
          projectId: 'proj-b',
          startDate: env.addHours(baseStart, 4),
          finishDate: env.addHours(baseStart, 5),
          requesterId: 'user-2',
          trainingBooks: [],
          translationBooks: [],
          status: DraftGenerationBuildState.Completed,
          hasServalBuild: false,
          hasEvents: true
        })
      ];

      // SUT
      const summary = buildSummary(rows);

      // Total builds is 3 (all are considered since they have projectId)
      expect(summary.totalBuilds).toBe(3);
      // But book averages should only consider the 2 Serval builds:
      // Training: (2 + 3) / 2 = 2.5
      // Translation: (1 + 2) / 2 = 1.5
      // NOT (2 + 3 + 0) / 3 = 1.67 for training
      // NOT (1 + 2 + 0) / 3 = 1.0 for translation
      expect(summary.averageTrainingBooksPerBuild).toBeCloseTo(2.5);
      expect(summary.averageTranslationBooksPerBuild).toBeCloseTo(1.5);
    });

    it('counts builds Serval did not know about', () => {
      const env = new TestEnvironment();
      const baseStart: Date = new Date('2024-01-01T00:00:00Z');

      const rows = [
        // Build with Serval data and events (fully known)
        env.createRowWithDetails({
          projectId: 'proj-a',
          startDate: env.addHours(baseStart, 0),
          finishDate: env.addHours(baseStart, 1),
          requesterId: 'user-1',
          status: DraftGenerationBuildState.Completed,
          hasServalBuild: true,
          hasEvents: true
        }),
        // Build with events only - no Serval data (Serval did not know about)
        env.createRowWithDetails({
          projectId: 'proj-a',
          startDate: env.addHours(baseStart, 2),
          finishDate: env.addHours(baseStart, 3),
          requesterId: 'user-1',
          status: DraftGenerationBuildState.Completed,
          hasServalBuild: false,
          hasEvents: true
        }),
        // Another build with events only (Serval did not know about)
        env.createRowWithDetails({
          projectId: 'proj-b',
          startDate: env.addHours(baseStart, 4),
          finishDate: env.addHours(baseStart, 5),
          requesterId: 'user-2',
          status: DraftGenerationBuildState.Active,
          hasServalBuild: false,
          hasEvents: true
        }),
        // Build without SF project ID (unconsidered - should not count)
        env.createRowWithDetails({
          projectId: undefined,
          startDate: env.addHours(baseStart, 6),
          finishDate: env.addHours(baseStart, 7),
          requesterId: undefined,
          status: DraftGenerationBuildState.Pending,
          hasServalBuild: false,
          hasEvents: true
        })
      ];

      // SUT
      const summary = buildSummary(rows);

      // Only 2 considered rows have events but no servalBuild
      expect(summary.buildsServalDidNotKnowAbout).toBe(2);
      expect(summary.unconsideredBuilds).toBe(1);
    });

    it('counts builds SF did not know about', () => {
      const env = new TestEnvironment();
      const baseStart: Date = new Date('2024-01-01T00:00:00Z');

      const rows = [
        // Build with Serval data and events (fully known)
        env.createRowWithDetails({
          projectId: 'proj-a',
          startDate: env.addHours(baseStart, 0),
          finishDate: env.addHours(baseStart, 1),
          requesterId: 'user-1',
          status: DraftGenerationBuildState.Completed,
          hasServalBuild: true,
          hasEvents: true
        }),
        // Build with Serval data only - no SF events (SF did not know about)
        env.createRowWithDetails({
          projectId: 'proj-a',
          startDate: env.addHours(baseStart, 2),
          finishDate: env.addHours(baseStart, 3),
          requesterId: 'user-1',
          status: DraftGenerationBuildState.Completed,
          hasServalBuild: true,
          hasEvents: false
        }),
        // Another build with Serval data only (SF did not know about)
        env.createRowWithDetails({
          projectId: 'proj-b',
          startDate: env.addHours(baseStart, 4),
          finishDate: env.addHours(baseStart, 5),
          requesterId: 'user-2',
          status: DraftGenerationBuildState.Active,
          hasServalBuild: true,
          hasEvents: false
        }),
        // Build without SF project ID (unconsidered - should not count)
        env.createRowWithDetails({
          projectId: undefined,
          startDate: env.addHours(baseStart, 6),
          finishDate: env.addHours(baseStart, 7),
          requesterId: undefined,
          status: DraftGenerationBuildState.Pending,
          hasServalBuild: true,
          hasEvents: false
        })
      ];

      // SUT
      const summary = buildSummary(rows);

      // Only 2 considered rows have servalBuild but no events
      expect(summary.buildsSfDidNotKnowAbout).toBe(2);
      expect(summary.unconsideredBuilds).toBe(1);
    });

    it('uses SF timestamps for inter-build gap calculation when available', () => {
      const env = new TestEnvironment();
      const baseStart: Date = new Date('2024-01-01T00:00:00Z');

      // Build 1: Serval created at hour 0, finished at hour 1
      // SF acknowledged at hour 1.5
      // Build 2: Serval created at hour 4, finished at hour 5
      // SF requested at hour 3
      // Expected gap: From SF acknowledged (hour 1.5) to SF requested (hour 3) = 1.5 hours = 5400000 ms
      // Without SF timestamps, gap would be: Serval finish (hour 1) to Serval created (hour 4) = 3 hours = 10800000 ms

      const rows = [
        env.createRowWithDetails({
          projectId: 'proj-a',
          startDate: env.addHours(baseStart, 0),
          finishDate: env.addHours(baseStart, 1),
          sfAcknowledgedTime: env.addHours(baseStart, 1.5),
          requesterId: 'user-1',
          status: DraftGenerationBuildState.Completed
        }),
        env.createRowWithDetails({
          projectId: 'proj-a',
          startDate: env.addHours(baseStart, 4),
          finishDate: env.addHours(baseStart, 5),
          sfUserRequestTime: env.addHours(baseStart, 3),
          requesterId: 'user-1',
          status: DraftGenerationBuildState.Completed
        })
      ];

      // SUT
      const summary = buildSummary(rows);

      // Gap should be from SF acknowledged (hour 1.5) to SF requested (hour 3) = 1.5 hours
      const expectedGapMs: number = 1.5 * 60 * 60 * 1000; // 5400000 ms
      expect(summary.averageInterBuildTimeMs).toBeCloseTo(expectedGapMs);
    });

    it('falls back to Serval timestamps for inter-build gap when SF timestamps are missing', () => {
      const env = new TestEnvironment();
      const baseStart: Date = new Date('2024-01-01T00:00:00Z');

      // Build 1: Serval created at hour 0, finished at hour 1 (no SF timestamps)
      // Build 2: Serval created at hour 4, finished at hour 5 (no SF timestamps)
      // Expected gap: From Serval finish (hour 1) to Serval created (hour 4) = 3 hours = 10800000 ms

      const rows = [
        env.createRowWithDetails({
          projectId: 'proj-a',
          startDate: env.addHours(baseStart, 0),
          finishDate: env.addHours(baseStart, 1),
          requesterId: 'user-1',
          status: DraftGenerationBuildState.Completed
        }),
        env.createRowWithDetails({
          projectId: 'proj-a',
          startDate: env.addHours(baseStart, 4),
          finishDate: env.addHours(baseStart, 5),
          requesterId: 'user-1',
          status: DraftGenerationBuildState.Completed
        })
      ];

      // SUT
      const summary = buildSummary(rows);

      // Gap should be from Serval finish (hour 1) to Serval created (hour 4) = 3 hours
      const expectedGapMs: number = 3 * 60 * 60 * 1000; // 10800000 ms
      expect(summary.averageInterBuildTimeMs).toBeCloseTo(expectedGapMs);
    });

    it('computes flat average of all inter-build gaps across projects', () => {
      const env = new TestEnvironment();
      const baseStart: Date = new Date('2024-01-01T00:00:00Z');

      // proj-a has 3 builds producing gaps of 1h and 3h (per-project average would be 2h)
      // proj-b has 2 builds producing a gap of 1h (per-project average would be 1h)
      // Average-of-averages would give (2h + 1h) / 2 = 1.5h
      // Flat average of all gaps [1h, 3h, 1h] gives (1 + 3 + 1) / 3 = 5/3 h ≈ 1.667h
      const rows: ServalBuildRow[] = [
        env.createRowWithDetails({
          projectId: 'proj-a',
          startDate: env.addHours(baseStart, 0),
          finishDate: env.addHours(baseStart, 1),
          requesterId: 'user-1',
          status: DraftGenerationBuildState.Completed
        }),
        env.createRowWithDetails({
          projectId: 'proj-a',
          startDate: env.addHours(baseStart, 2),
          finishDate: env.addHours(baseStart, 3),
          requesterId: 'user-1',
          status: DraftGenerationBuildState.Completed
        }),
        env.createRowWithDetails({
          projectId: 'proj-a',
          startDate: env.addHours(baseStart, 6),
          finishDate: env.addHours(baseStart, 7),
          requesterId: 'user-1',
          status: DraftGenerationBuildState.Completed
        }),
        env.createRowWithDetails({
          projectId: 'proj-b',
          startDate: env.addHours(baseStart, 0),
          finishDate: env.addHours(baseStart, 1),
          requesterId: 'user-2',
          status: DraftGenerationBuildState.Completed
        }),
        env.createRowWithDetails({
          projectId: 'proj-b',
          startDate: env.addHours(baseStart, 2),
          finishDate: env.addHours(baseStart, 3),
          requesterId: 'user-2',
          status: DraftGenerationBuildState.Completed
        })
      ];

      // SUT
      const summary: ServalBuildSummary = buildSummary(rows);

      // Flat average of all gaps: (1h + 3h + 1h) / 3 = 5/3 hours
      const expectedFlatAverageMs: number = (5 / 3) * 60 * 60 * 1000;
      expect(summary.averageInterBuildTimeMs).toBeCloseTo(expectedFlatAverageMs);
    });

    it('computes percentTimeOnSF for successfully completed builds with all timing data', () => {
      const env = new TestEnvironment();
      const baseStart: Date = new Date('2024-01-01T00:00:00Z');

      // Build 1: Total duration 10 hours (SF user request to SF acknowledged), Serval duration 6 hours
      // SF time = 10 - 6 = 4 hours. % on SF = 4/10 = 40%
      // Build 2: Total duration 8 hours, Serval duration 4 hours
      // SF time = 8 - 4 = 4 hours. % on SF = 4/8 = 50%
      // Overall: Total SF+Serval = 18 hours, Total Serval = 10 hours, Total SF = 8 hours
      // % on SF = 8/18 = 44.44%

      const rows = [
        env.createRowWithDetails({
          projectId: 'proj-a',
          sfUserRequestTime: env.addHours(baseStart, 0),
          sfAcknowledgedTime: env.addHours(baseStart, 10),
          startDate: env.addHours(baseStart, 2), // Serval created
          finishDate: env.addHours(baseStart, 8), // Serval finished (6 hours on Serval)
          requesterId: 'user-1',
          status: DraftGenerationBuildState.Completed
        }),
        env.createRowWithDetails({
          projectId: 'proj-b',
          sfUserRequestTime: env.addHours(baseStart, 0),
          sfAcknowledgedTime: env.addHours(baseStart, 8),
          startDate: env.addHours(baseStart, 2), // Serval created
          finishDate: env.addHours(baseStart, 6), // Serval finished (4 hours on Serval)
          requesterId: 'user-2',
          status: DraftGenerationBuildState.Completed
        })
      ];

      // SUT
      const summary = buildSummary(rows);

      // Total duration = 10 + 8 = 18 hours
      // Total Serval duration = 6 + 4 = 10 hours
      // Total SF time = 18 - 10 = 8 hours
      // % on SF = 8/18 * 100 = 44.44%
      expect(summary.percentTimeOnSF).toBeCloseTo(44.44, 1);
    });

    it('excludes non-completed builds from percentTimeOnSF calculation', () => {
      const env = new TestEnvironment();
      const baseStart: Date = new Date('2024-01-01T00:00:00Z');

      const rows = [
        env.createRowWithDetails({
          projectId: 'proj-a',
          sfUserRequestTime: env.addHours(baseStart, 0),
          sfAcknowledgedTime: env.addHours(baseStart, 10),
          startDate: env.addHours(baseStart, 2),
          finishDate: env.addHours(baseStart, 8),
          requesterId: 'user-1',
          status: DraftGenerationBuildState.Completed // This one counts: 40% SF time
        }),
        env.createRowWithDetails({
          projectId: 'proj-b',
          sfUserRequestTime: env.addHours(baseStart, 0),
          sfAcknowledgedTime: env.addHours(baseStart, 20),
          startDate: env.addHours(baseStart, 2),
          finishDate: env.addHours(baseStart, 4),
          requesterId: 'user-2',
          status: DraftGenerationBuildState.Active // In progress - should be excluded
        }),
        env.createRowWithDetails({
          projectId: 'proj-c',
          sfUserRequestTime: env.addHours(baseStart, 0),
          sfAcknowledgedTime: env.addHours(baseStart, 20),
          startDate: env.addHours(baseStart, 2),
          finishDate: env.addHours(baseStart, 4),
          requesterId: 'user-3',
          status: DraftGenerationBuildState.Faulted // Faulted - should be excluded
        }),
        env.createRowWithDetails({
          projectId: 'proj-d',
          sfUserRequestTime: env.addHours(baseStart, 0),
          sfAcknowledgedTime: env.addHours(baseStart, 20),
          startDate: env.addHours(baseStart, 2),
          finishDate: env.addHours(baseStart, 4),
          requesterId: 'user-4',
          status: DraftGenerationBuildState.Canceled // Cancelled - should be excluded
        })
      ];

      // SUT
      const summary = buildSummary(rows);

      // Only the completed build is considered: 10 hours total, 6 hours Serval, 4 hours SF = 40%
      expect(summary.percentTimeOnSF).toBeCloseTo(40, 0);
    });

    it('returns undefined for percentTimeOnSF when no builds have all required timing data', () => {
      const env = new TestEnvironment();
      const baseStart: Date = new Date('2024-01-01T00:00:00Z');

      const rows = [
        env.createRowWithDetails({
          projectId: 'proj-a',
          // Missing sfUserRequestTime
          sfAcknowledgedTime: env.addHours(baseStart, 10),
          startDate: env.addHours(baseStart, 2),
          finishDate: env.addHours(baseStart, 8),
          requesterId: 'user-1',
          status: DraftGenerationBuildState.Completed
        }),
        env.createRowWithDetails({
          projectId: 'proj-b',
          sfUserRequestTime: env.addHours(baseStart, 0),
          // Missing sfAcknowledgedTime
          startDate: env.addHours(baseStart, 2),
          finishDate: env.addHours(baseStart, 8),
          requesterId: 'user-2',
          status: DraftGenerationBuildState.Completed
        })
      ];

      // SUT
      const summary = buildSummary(rows);

      expect(summary.percentTimeOnSF).toBeUndefined();
    });

    it('ignores builds with inconsistent percentTimeOnSF timing ranges', () => {
      const env = new TestEnvironment();
      const baseStart: Date = new Date('2024-01-01T00:00:00Z');

      const rows = [
        env.createRowWithDetails({
          projectId: 'proj-valid',
          sfUserRequestTime: env.addHours(baseStart, 0),
          sfAcknowledgedTime: env.addHours(baseStart, 10),
          startDate: env.addHours(baseStart, 2),
          finishDate: env.addHours(baseStart, 8),
          requesterId: 'user-1',
          status: DraftGenerationBuildState.Completed
        }),
        env.createRowWithDetails({
          projectId: 'proj-invalid-total',
          // Invalid total duration: acknowledgment before request
          sfUserRequestTime: env.addHours(baseStart, 10),
          sfAcknowledgedTime: env.addHours(baseStart, 8),
          startDate: env.addHours(baseStart, 2),
          finishDate: env.addHours(baseStart, 4),
          requesterId: 'user-2',
          status: DraftGenerationBuildState.Completed
        }),
        env.createRowWithDetails({
          projectId: 'proj-invalid-serval',
          // Invalid Serval duration: finish before created
          sfUserRequestTime: env.addHours(baseStart, 0),
          sfAcknowledgedTime: env.addHours(baseStart, 10),
          startDate: env.addHours(baseStart, 7),
          finishDate: env.addHours(baseStart, 6),
          requesterId: 'user-3',
          status: DraftGenerationBuildState.Completed
        }),
        env.createRowWithDetails({
          projectId: 'proj-invalid-overlap',
          // Invalid overlap: Serval runtime longer than full lifecycle in SF
          sfUserRequestTime: env.addHours(baseStart, 0),
          sfAcknowledgedTime: env.addHours(baseStart, 5),
          startDate: env.addHours(baseStart, 1),
          finishDate: env.addHours(baseStart, 8),
          requesterId: 'user-4',
          status: DraftGenerationBuildState.Completed
        })
      ];

      // SUT
      const summary = buildSummary(rows);

      // Only the valid build should contribute to the percentage: 40%
      expect(summary.percentTimeOnSF).toBeCloseTo(40, 0);
    });

    it('ignores unknown inter-build gaps when averaging', () => {
      const env = new TestEnvironment();
      const baseStart: Date = new Date('2024-01-01T00:00:00Z');
      const rows = [
        // Build 1: has Serval data, finishes at hour 1 (servalFinished). No sfAcknowledgedTime, so the gap
        // calculation will fall back to servalFinished for the "previous finish" time.
        env.createRowWithDetails({
          projectId: 'proj-a',
          startDate: env.addHours(baseStart, 0),
          finishDate: env.addHours(baseStart, 1),
          sfUserRequestTime: env.addHours(baseStart, 0),
          hasServalBuild: true
        }),
        // Build 2: NO Serval data (hasServalBuild=false), so servalFinished is undefined. Since sfAcknowledgedTime
        // is also undefined, this build has no known finish time.
        env.createRowWithDetails({
          projectId: 'proj-a',
          startDate: undefined,
          finishDate: undefined,
          sfUserRequestTime: env.addHours(baseStart, 3),
          sfAcknowledgedTime: undefined,
          hasServalBuild: false
        }),
        // Build 3: has Serval data, starts at hour 6.
        env.createRowWithDetails({
          projectId: 'proj-a',
          startDate: env.addHours(baseStart, 6),
          finishDate: env.addHours(baseStart, 7),
          sfUserRequestTime: env.addHours(baseStart, 6),
          hasServalBuild: true
        })
      ];

      // SUT
      const gaps: Array<number | undefined> = gapsBetweenBuildsMs(rows);
      const summary = buildSummary(rows);

      expect(gaps.length).toBe(2);
      // Gap 1→2: Build 1 finishes (servalFinished) at hour 1, Build 2 starts (sfUserRequestTime) at hour 3 = 2h gap.
      expect(gaps[0]).toBe(2 * 60 * 60 * 1000);
      // Gap 2→3: Build 2 has no finish time (no sfAcknowledgedTime and no servalFinished), so the gap is unknown.
      expect(gaps[1]).toBeUndefined();
      // The average only counts known gaps, so the average is just the 2h gap.
      expect(summary.averageInterBuildTimeMs).toBe(2 * 60 * 60 * 1000);
    });

    it('records undefined gap and logs error when consecutive builds have overlapping durations', () => {
      const env = new TestEnvironment();
      mockedConsole.reset();
      mockedConsole.expectAndHide(/Two consecutive builds \(build-id, build-id\) have overlapping durations\./);
      const baseStart: Date = new Date('2024-01-01T00:00:00Z');
      // Build 1 finishes at hour 5, but build 2 starts at hour 3 — the next build started before the previous
      // finished, so the gap is negative (overlapping).
      const rows = [
        env.createRowWithDetails({
          projectId: 'proj-a',
          startDate: env.addHours(baseStart, 0),
          finishDate: env.addHours(baseStart, 5),
          sfUserRequestTime: env.addHours(baseStart, 0),
          hasServalBuild: true
        }),
        env.createRowWithDetails({
          projectId: 'proj-a',
          startDate: env.addHours(baseStart, 3),
          finishDate: env.addHours(baseStart, 6),
          sfUserRequestTime: env.addHours(baseStart, 3),
          hasServalBuild: true
        })
      ];

      // SUT
      const gaps: Array<number | undefined> = gapsBetweenBuildsMs(rows);

      expect(gaps.length).toBe(1);
      // The gap is undefined because the builds overlap
      expect(gaps[0]).toBeUndefined();
      mockedConsole.verify();
      mockedConsole.reset();
    });
  });

  describe('duration calculation', () => {
    it('uses SF timestamps when both are available', () => {
      const env = new TestEnvironment();
      const sfUserRequestTime: Date = new Date('2024-01-01T00:00:00Z');
      const sfAcknowledgedTime: Date = new Date('2024-01-01T02:00:00Z'); // 2 hours later
      const servalCreated: Date = new Date('2024-01-01T00:30:00Z');
      const servalFinished: Date = new Date('2024-01-01T01:30:00Z'); // 1 hour Serval duration

      const report: ServalBuildReportDto = env.createReport({
        dateCreated: servalCreated,
        dateFinished: servalFinished,
        userRequestTime: sfUserRequestTime,
        acknowledgedTime: sfAcknowledgedTime
      });

      // SUT
      const rows = env.component['buildRows']([report]);

      // Expect duration from SF timestamps (2 hours = 7200000 ms), not Serval (1 hour)
      expect(rows[0].durationMs).toBe(7200000);
    });

    it('falls back to Serval timestamps when SF timestamps are missing', () => {
      const env = new TestEnvironment();
      const servalCreated: Date = new Date('2024-01-01T00:00:00Z');
      const servalFinished: Date = new Date('2024-01-01T01:00:00Z'); // 1 hour duration

      const report: ServalBuildReportDto = env.createReport({
        dateCreated: servalCreated,
        dateFinished: servalFinished,
        userRequestTime: undefined,
        acknowledgedTime: undefined
      });

      // SUT
      const rows = env.component['buildRows']([report]);

      // Expect duration from Serval timestamps (1 hour = 3600000 ms)
      expect(rows[0].durationMs).toBe(3600000);
    });

    it('uses SF start with Serval end when only SF start is available', () => {
      const env = new TestEnvironment();
      const sfUserRequestTime: Date = new Date('2024-01-01T00:00:00Z');
      const servalCreated: Date = new Date('2024-01-01T00:30:00Z');
      const servalFinished: Date = new Date('2024-01-01T01:30:00Z');

      const report: ServalBuildReportDto = env.createReport({
        dateCreated: servalCreated,
        dateFinished: servalFinished,
        userRequestTime: sfUserRequestTime,
        acknowledgedTime: undefined
      });

      // SUT
      const rows = env.component['buildRows']([report]);

      // Expect duration from SF start to Serval finish (1.5 hours = 5400000 ms)
      expect(rows[0].durationMs).toBe(5400000);
    });

    it('uses Serval start with SF end when only SF end is available', () => {
      const env = new TestEnvironment();
      const servalCreated: Date = new Date('2024-01-01T00:00:00Z');
      const servalFinished: Date = new Date('2024-01-01T01:00:00Z');
      const sfAcknowledgedTime: Date = new Date('2024-01-01T01:30:00Z');

      const report: ServalBuildReportDto = env.createReport({
        dateCreated: servalCreated,
        dateFinished: servalFinished,
        userRequestTime: undefined,
        acknowledgedTime: sfAcknowledgedTime
      });

      // SUT
      const rows = env.component['buildRows']([report]);

      // Expect duration from Serval start to SF acknowledged (1.5 hours = 5400000 ms)
      expect(rows[0].durationMs).toBe(5400000);
    });
  });

  describe('date range filtering', () => {
    it('SF user request time out of range', () => {
      const env = new TestEnvironment();
      const rangeStart: Date = new Date('2024-01-10T00:00:00Z');
      const rangeEnd: Date = new Date('2024-01-20T23:59:59Z');
      const range: NormalizedDateRange = { start: rangeStart, end: rangeEnd };
      const userRequestTime: Date = new Date('2024-01-05T12:00:00Z');
      const report: ServalBuildReportDto = env.makeReport({ requestTime: userRequestTime });

      // SUT
      const result: boolean = env.component['didReportBeginOutOfDateRange'](report, range);

      expect(result).toBe(true);
    });

    it('SF user request time in range', () => {
      const env = new TestEnvironment();
      const rangeStart: Date = new Date('2024-01-10T00:00:00Z');
      const rangeEnd: Date = new Date('2024-01-20T23:59:59Z');
      const range: NormalizedDateRange = { start: rangeStart, end: rangeEnd };
      const userRequestTime: Date = new Date('2024-01-15T12:00:00Z');
      const report: ServalBuildReportDto = env.makeReport({ requestTime: userRequestTime });

      // SUT
      const result: boolean = env.component['didReportBeginOutOfDateRange'](report, range);

      expect(result).toBe(false);
    });
  });

  describe('createSpreadsheetRows', () => {
    it('should use SF timestamps with fallback to Serval timestamps', () => {
      const env = new TestEnvironment();
      const sfUserRequestTime: Date = new Date('2024-06-01T08:00:00Z');
      const sfAcknowledgedTime: Date = new Date('2024-06-01T10:00:00Z');
      const servalCreated: Date = new Date('2024-06-01T08:05:00Z');
      const servalFinished: Date = new Date('2024-06-01T09:55:00Z');

      const rowWithSfTimestamps: ServalBuildRow = env.createRowWithDetails({
        projectId: 'proj-1',
        startDate: servalCreated,
        finishDate: servalFinished,
        sfUserRequestTime: sfUserRequestTime,
        sfAcknowledgedTime: sfAcknowledgedTime,
        hasServalBuild: true
      });
      const rowWithServalOnly: ServalBuildRow = env.createRowWithDetails({
        projectId: 'proj-2',
        startDate: servalCreated,
        finishDate: servalFinished,
        sfUserRequestTime: undefined,
        sfAcknowledgedTime: undefined,
        hasServalBuild: true
      });

      // SUT
      const result: SpreadsheetRow[] = ServalBuildsComponent['createSpreadsheetRows']([
        rowWithSfTimestamps,
        rowWithServalOnly
      ]);

      // Row with SF timestamps should use SF timestamps
      expect(result[0].startTime).toBe(sfUserRequestTime.toISOString());
      expect(result[0].endTime).toBe(sfAcknowledgedTime.toISOString());

      // Row without SF timestamps should fall back to Serval timestamps
      expect(result[1].startTime).toBe(servalCreated.toISOString());
      expect(result[1].endTime).toBe(servalFinished.toISOString());
    });

    it('should compute duration from effective start and end timestamps', () => {
      const env = new TestEnvironment();
      const sfUserRequestTime: Date = new Date('2024-06-01T08:00:00Z');
      const sfAcknowledgedTime: Date = new Date('2024-06-01T10:00:00Z');

      const row: ServalBuildRow = env.createRowWithDetails({
        projectId: 'proj-1',
        startDate: new Date('2024-06-01T08:05:00Z'),
        finishDate: new Date('2024-06-01T09:55:00Z'),
        sfUserRequestTime: sfUserRequestTime,
        sfAcknowledgedTime: sfAcknowledgedTime,
        hasServalBuild: true
      });

      // SUT
      const result: SpreadsheetRow[] = ServalBuildsComponent['createSpreadsheetRows']([row]);

      // Duration should be based on SF timestamps: 2 hours = 120 minutes
      expect(result[0].durationMinutes).toBe('120');
    });
  });

  describe('requested sorting', () => {
    it('sorts by user request time with serval created fallback', () => {
      const env = new TestEnvironment();
      const userRequestLater: Date = new Date('2024-01-02T00:00:00Z');
      const userRequestEarlier: Date = new Date('2024-01-01T00:00:00Z');
      const servalCreatedFallback: Date = new Date('2024-01-01T12:00:00Z');

      const reports: ServalBuildReportDto[] = [
        // This build will be in the middle of the list.
        env.createReport({
          buildId: 'build-1',
          dateCreated: servalCreatedFallback,
          dateFinished: new Date('2024-01-01T13:00:00Z'),
          userRequestTime: undefined
        }),
        // This build will be last on the list (at the top).
        env.createReport({
          buildId: 'build-2',
          dateCreated: new Date('2024-01-01T10:00:00Z'),
          dateFinished: new Date('2024-01-01T11:00:00Z'),
          userRequestTime: userRequestLater
        }),
        // This build will be earliest in the list (at the bottom)
        env.createReport({
          buildId: 'build-3',
          dateCreated: new Date('2024-01-01T09:00:00Z'),
          dateFinished: new Date('2024-01-01T10:00:00Z'),
          userRequestTime: userRequestEarlier
        })
      ];

      // SUT
      const rows: Array<{ report: ServalBuildReportDto }> = env.component['buildRows'](reports);

      expect(rows[0].report.build?.additionalInfo?.buildId).toBe('build-2');
      expect(rows[1].report.build?.additionalInfo?.buildId).toBe('build-1');
      expect(rows[2].report.build?.additionalInfo?.buildId).toBe('build-3');
      expect(rows[1].report.timeline.requestTime?.toISOString()).toBe(servalCreatedFallback.toISOString());
    });
  });
});

/** Provides helpers for constructing test data for ServalBuildsComponent tests. */
class TestEnvironment {
  readonly component: ServalBuildsComponent;
  readonly fixture: ComponentFixture<ServalBuildsComponent>;
  readonly builds$: BehaviorSubject<ServalBuildReportDto[] | undefined> = new BehaviorSubject<
    ServalBuildReportDto[] | undefined
  >(undefined);

  constructor() {
    const mockedUserProfileDoc = mock(UserProfileDoc);
    const userProfileDoc: UserProfileDoc = instance(mockedUserProfileDoc);
    const profileData: { displayName: string; avatarUrl: string } = {
      displayName: 'Test User',
      avatarUrl: ''
    };

    when(mockedUserProfileDoc.data).thenReturn(profileData);
    when(mockNoticeService.loadingStarted(anything())).thenReturn(undefined);
    when(mockNoticeService.loadingFinished(anything())).thenReturn(undefined);
    when(mockDraftGenerationService.getBuildsSince(anything())).thenReturn(this.builds$);
    when(mockDialogService.openMatDialog(anything(), anything(), anything())).thenReturn(undefined as never);
    when(mockExportService.exportCsv(anything(), anything(), anything(), anything(), anything())).thenReturn(undefined);
    when(mockExportService.exportRsv(anything(), anything(), anything(), anything(), anything())).thenReturn(undefined);
    when(mockUserService.getProfile(anything())).thenReturn(Promise.resolve(userProfileDoc));

    this.fixture = TestBed.createComponent(ServalBuildsComponent);
    this.component = this.fixture.componentInstance;
  }

  /** Creates a default BuildReportTimeline with optional overrides. */
  makeTimeline(overrides: Partial<BuildReportTimeline> = {}): BuildReportTimeline {
    return {
      servalCreated: undefined,
      servalStarted: undefined,
      servalCompleted: undefined,
      servalFinished: undefined,
      sfUserRequested: undefined,
      sfBuildProjectSubmitted: undefined,
      sfUserCancelled: undefined,
      sfAcknowledgedCompletion: undefined,
      requestTime: undefined,
      phases: undefined,
      ...overrides
    };
  }

  /** Creates a default ServalBuildReportDto with optional timeline overrides. */
  makeReport(timelineOverrides: Partial<BuildReportTimeline> = {}): ServalBuildReportDto {
    return {
      build: undefined,
      project: undefined,
      timeline: this.makeTimeline(timelineOverrides),
      config: {
        trainingScriptureRanges: [],
        translationScriptureRanges: [],
        trainingDataFileIds: []
      },
      problems: [],
      draftGenerationRequestId: undefined,
      requesterSFUserId: undefined,
      status: DraftGenerationBuildState.Completed
    };
  }

  createRow(projectDeleted: boolean, durationMs: number): any {
    const sfProjectId: string | undefined = projectDeleted ? undefined : 'active-project-id';
    const shortName: string = projectDeleted ? 'DEL' : 'ACT';
    const name: string = projectDeleted ? 'Deleted Project' : 'Active Project';

    const servalBuild: BuildDto = {
      id: 'resource-id',
      href: 'resource-href',
      revision: 1,
      engine: { id: 'engine-id', href: 'engine-href' },
      percentCompleted: 100,
      message: 'done',
      state: BuildStates.Completed,
      queueDepth: 0,
      additionalInfo: {
        buildId: 'build-id',
        step: 0,
        trainingScriptureRanges: [],
        translationEngineId: 'translation-engine-id',
        translationScriptureRanges: [],
        trainingDataFileIds: [],
        canDenormalizeQuotes: true
      }
    };

    const report: ServalBuildReportDto = {
      build: servalBuild,
      project: sfProjectId != null ? { sfProjectId: sfProjectId, shortName: shortName, name: name } : undefined,
      timeline: this.makeTimeline({
        servalCreated: new Date(0),
        servalFinished: new Date(durationMs)
      }),
      config: {
        trainingScriptureRanges: [],
        translationScriptureRanges: [],
        trainingDataFileIds: []
      },
      problems: [],
      draftGenerationRequestId: undefined,
      requesterSFUserId: sfProjectId == null ? undefined : 'requester-user-id',
      status: DraftGenerationBuildState.Completed
    };

    return {
      report: report,
      trainingBooks: [],
      translationBooks: [],
      projectNameDisplay: buildProjectDisplayName(shortName, name, sfProjectId),
      durationMs: durationMs,
      projectServalAdminUrl: undefined,
      projectDeleted: sfProjectId == null
    };
  }

  createRowWithDetails({
    durationMs = 1000,
    projectId = undefined,
    projectShortName = 'PRJ',
    projectName = 'Project Name',
    requesterId = undefined,
    startDate = new Date(0),
    finishDate,
    trainingBooks = [],
    translationBooks = [],
    status = DraftGenerationBuildState.Completed,
    problems = [],
    sfUserRequestTime = undefined,
    sfAcknowledgedTime = undefined,
    hasServalBuild = true,
    hasEvents = false
  }: {
    durationMs?: number;
    projectId?: string;
    projectShortName?: string;
    projectName?: string;
    requesterId?: string;
    startDate?: Date;
    finishDate?: Date;
    trainingBooks?: ProjectBooks[];
    translationBooks?: ProjectBooks[];
    status?: DraftGenerationBuildState;
    problems?: string[];
    sfUserRequestTime?: Date;
    sfAcknowledgedTime?: Date;
    hasServalBuild?: boolean;
    hasEvents?: boolean;
  } = {}): any {
    const start: Date = startDate ?? new Date(0);
    const computedFinish: Date = finishDate ?? new Date(start.getTime() + durationMs);

    const servalBuild: BuildDto | undefined = hasServalBuild
      ? {
          id: 'resource-id',
          href: 'resource-href',
          revision: 1,
          engine: { id: 'engine-id', href: 'engine-href' },
          percentCompleted: 100,
          message: 'done',
          state: status.toUpperCase() as BuildStates,
          queueDepth: 0,
          additionalInfo: {
            buildId: 'build-id',
            step: 0,
            trainingScriptureRanges: [],
            translationEngineId: 'translation-engine-id',
            translationScriptureRanges: [],
            trainingDataFileIds: [],
            canDenormalizeQuotes: true,
            requestedByUserId: requesterId
          }
        }
      : undefined;

    const report: ServalBuildReportDto = {
      build: servalBuild,
      project:
        projectId != null ? { sfProjectId: projectId, shortName: projectShortName, name: projectName } : undefined,
      timeline: this.makeTimeline({
        servalCreated: hasServalBuild ? start : undefined,
        servalFinished: hasServalBuild ? computedFinish : undefined,
        sfUserRequested: sfUserRequestTime ?? (hasEvents ? start : undefined),
        sfAcknowledgedCompletion: sfAcknowledgedTime,
        requestTime: sfUserRequestTime ?? start
      }),
      config: {
        trainingScriptureRanges: [],
        translationScriptureRanges: [],
        trainingDataFileIds: []
      },
      problems: problems,
      draftGenerationRequestId: undefined,
      requesterSFUserId: requesterId,
      status: status
    };

    const durationValue: number = computedFinish.getTime() - start.getTime();

    return {
      report: report,
      trainingBooks: trainingBooks,
      translationBooks: translationBooks,
      projectNameDisplay: buildProjectDisplayName(projectShortName, projectName, projectId),
      durationMs: durationValue,
      projectServalAdminUrl: undefined,
      projectDeleted: projectId == null
    };
  }

  createProjectBooks(projectId: string, books: string[], projectDisplayName?: string): ProjectBooks[] {
    const displayName: string = projectDisplayName ?? projectId.toUpperCase();
    return [{ sfProjectId: projectId, projectDisplayName: displayName, books: books }];
  }

  createReport({
    buildId = 'build-id',
    dateCreated = new Date(0),
    dateFinished = new Date(0),
    userRequestTime = undefined,
    acknowledgedTime = undefined
  }: {
    buildId?: string;
    dateCreated?: Date;
    dateFinished?: Date;
    userRequestTime?: Date;
    acknowledgedTime?: Date;
  } = {}): ServalBuildReportDto {
    const servalBuild: BuildDto = {
      id: buildId,
      href: 'resource-href',
      revision: 1,
      engine: { id: 'engine-id', href: 'engine-href' },
      percentCompleted: 100,
      message: 'done',
      state: BuildStates.Completed,
      queueDepth: 0,
      additionalInfo: {
        buildId: buildId,
        step: 0,
        trainingScriptureRanges: [],
        translationEngineId: 'translation-engine-id',
        translationScriptureRanges: [],
        trainingDataFileIds: [],
        canDenormalizeQuotes: true
      }
    };

    return {
      build: servalBuild,
      project: { sfProjectId: 'project-id', shortName: 'PRJ', name: 'Project Name' },
      timeline: this.makeTimeline({
        servalCreated: dateCreated,
        servalFinished: dateFinished,
        sfUserRequested: userRequestTime,
        sfAcknowledgedCompletion: acknowledgedTime,
        requestTime: userRequestTime ?? dateCreated
      }),
      config: {
        trainingScriptureRanges: [],
        translationScriptureRanges: [],
        trainingDataFileIds: []
      },
      problems: [],
      draftGenerationRequestId: undefined,
      requesterSFUserId: undefined,
      status: DraftGenerationBuildState.Completed
    };
  }

  addHours(date: Date, hours: number): Date {
    const millisecondsPerHour: number = 1000 * 60 * 60;
    const startMs: number = date.getTime();
    return new Date(startMs + hours * millisecondsPerHour);
  }
}
