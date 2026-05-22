import { ComponentFixture, fakeAsync, flush, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { BehaviorSubject, firstValueFrom, Observable, skip, Subject, take } from 'rxjs';
import { anything, mock, verify, when } from 'ts-mockito';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nService } from 'xforge-common/i18n.service';
import { MockConsole } from 'xforge-common/mock-console';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { provideTestOnlineStatus } from 'xforge-common/test-online-status-providers';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { provideTestRealtime } from 'xforge-common/test-realtime-providers';
import { configureTestingModule, getTestTranslocoModule } from 'xforge-common/test-utils';
import { UserService } from 'xforge-common/user.service';
import { notNull } from '../../type-utils';
import { SF_TYPE_REGISTRY } from '../core/models/sf-type-registry';
import { BuildDto } from '../machine-api/build-dto';
import { BuildStates } from '../machine-api/build-states';
import { DraftGenerationService } from '../translate/draft-generation/draft-generation.service';
import { NormalizedDateRange } from './date-range-picker.component';
import { DraftJobsExportService, SpreadsheetRow } from './draft-jobs-export.service';
import { ServalBuildProblemsDialog } from './serval-build-problems-dialog.component';
import {
  buildProjectDisplayName,
  BuildReportProblem,
  BuildReportTimeline,
  DraftGenerationBuildStatus,
  ProjectBooks,
  ServalBuildReportDto
} from './serval-build-report';
import { buildSummary, gapsBetweenBuildsMs } from './serval-builds-statistics';
import {
  BuildInputItem,
  RequesterInfo,
  ServalBuildRow,
  ServalBuildsComponent,
  ServalBuildSummary
} from './serval-builds.component';

const mockNoticeService = mock(NoticeService);
const mockDraftGenerationService = mock(DraftGenerationService);
const mockDialogService = mock(DialogService);
const mockExportService = mock(DraftJobsExportService);
const mockUserService = mock(UserService);
const mockI18nService = mock(I18nService);
const mockedActivatedRoute = mock(ActivatedRoute);
const mockedConsole: MockConsole = MockConsole.install();

describe('ServalBuildsComponent', () => {
  configureTestingModule(() => ({
    imports: [ServalBuildsComponent, getTestTranslocoModule()],
    providers: [
      provideTestRealtime(SF_TYPE_REGISTRY),
      provideTestOnlineStatus(),
      provideRouter([]),
      { provide: NoticeService, useMock: mockNoticeService },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService },
      { provide: DraftGenerationService, useMock: mockDraftGenerationService },
      { provide: DialogService, useMock: mockDialogService },
      { provide: DraftJobsExportService, useMock: mockExportService },
      { provide: UserService, useMock: mockUserService },
      { provide: I18nService, useMock: mockI18nService },
      { provide: ActivatedRoute, useMock: mockedActivatedRoute },
      provideNoopAnimations()
    ]
  }));

  describe('include deleted toggle', () => {
    it('excludes deleted projects when toggle is off', fakeAsync(() => {
      const env = new TestEnvironment();
      const activeRow = env.createRow({});
      const deletedRow = env.createRow({ projectId: null, projectDeleted: true });
      env.component['allRows'] = [activeRow, deletedRow];

      // SUT
      env.component['onIncludeDeletedChange'](false);
      env.waitForRowUpdate();

      expect(env.component['rows'].length).toBe(1);
      expect(env.component['rows'][0].report.project?.sfProjectId).toBeDefined();
    }));

    it('includes deleted projects when toggle is on', fakeAsync(() => {
      const env = new TestEnvironment();
      const activeRow = env.createRow({});
      const deletedRow = env.createRow({ projectId: null, projectDeleted: true });
      env.component['allRows'] = [activeRow, deletedRow];

      // SUT
      env.component['onIncludeDeletedChange'](true);
      env.waitForRowUpdate();

      expect(env.component['rows'].length).toBe(2);
      expect(env.component['rows'][1].report.project?.sfProjectId).toBeUndefined();
    }));
  });

  describe('search', () => {
    it('filters rows by SF project ID', fakeAsync(() => {
      const env = new TestEnvironment();
      const matchingRow: ServalBuildRow = env.createRow({ projectId: 'sf-project-123' });
      const otherRow: ServalBuildRow = env.createRow({ projectId: 'sf-project-999' });
      env.component['allRows'] = [matchingRow, otherRow];

      // SUT
      env.component['searchControl'].setValue('project-123');
      env.waitForRowUpdate();

      expect(env.component['rows']).toEqual([matchingRow]);
    }));

    it('filters rows by PT project ID', fakeAsync(() => {
      const env = new TestEnvironment();
      const matchingRow: ServalBuildRow = env.createRow({ ptProjectId: 'PT-PROJ-XYZ' });
      const otherRow: ServalBuildRow = env.createRow({ ptProjectId: 'PT-PROJ-OTHER' });
      env.component['allRows'] = [matchingRow, otherRow];

      // SUT
      env.component['searchControl'].setValue('proj-xyz');
      env.waitForRowUpdate();

      expect(env.component['rows']).toEqual([matchingRow]);
    }));

    it('filters rows by Serval build ID', fakeAsync(() => {
      // Suppose a user searches for a Serval build ID. It should match. And the matching
      // for this and any other searchable fields is both case insensitive and partial,
      // as a substring.
      const env = new TestEnvironment();
      const matchingRow: ServalBuildRow = env.createRow({ servalBuildId: 'SERVAL-BUILD-777' });
      const otherRow: ServalBuildRow = env.createRow({ servalBuildId: 'SERVAL-BUILD-888' });
      env.component['allRows'] = [matchingRow, otherRow];

      // SUT
      env.component['searchControl'].setValue('build-777');
      env.waitForRowUpdate();

      expect(env.component['rows']).toEqual([matchingRow]);
    }));

    it('filters rows by SF user ID', fakeAsync(() => {
      const env = new TestEnvironment();
      const matchingRow: ServalBuildRow = env.createRow({ requesterId: 'user-alpha' });
      const otherRow: ServalBuildRow = env.createRow({ requesterId: 'user-beta' });
      env.component['allRows'] = [matchingRow, otherRow];

      // SUT
      env.component['searchControl'].setValue('user-alpha');
      env.waitForRowUpdate();

      expect(env.component['rows']).toEqual([matchingRow]);
    }));

    it('filters rows by draft generation request ID', fakeAsync(() => {
      const env = new TestEnvironment();
      const matchingRow: ServalBuildRow = env.createRow({ draftGenerationRequestId: 'DRAFT-REQ-555' });
      const otherRow: ServalBuildRow = env.createRow({ draftGenerationRequestId: 'DRAFT-REQ-111' });
      env.component['allRows'] = [matchingRow, otherRow];

      // SUT
      env.component['searchControl'].setValue('req-555');
      env.waitForRowUpdate();

      expect(env.component['rows']).toEqual([matchingRow]);
    }));

    it('filters rows by requester display name', fakeAsync(() => {
      const env = new TestEnvironment();
      const firstRow: ServalBuildRow = env.createRow({ requesterId: 'user-alpha' });
      const secondRow: ServalBuildRow = env.createRow({ requesterId: 'user-beta' });
      env.component['allRows'] = [firstRow, secondRow];
      env.setRequesterData('user-alpha', {
        displayName: 'Alpha Display User',
        name: 'Alpha Name User',
        email: 'alpha@example.com'
      });
      env.setRequesterData('user-beta', {
        displayName: 'Beta Display User',
        name: 'Beta Name User',
        email: 'beta@example.com'
      });

      // SUT
      env.component['searchControl'].setValue('alpha display');
      env.waitForRowUpdate();

      expect(env.component['rows']).toEqual([firstRow]);
    }));

    it('filters rows by requester name', fakeAsync(() => {
      const env = new TestEnvironment();
      const firstRow: ServalBuildRow = env.createRow({ requesterId: 'user-alpha' });
      const secondRow: ServalBuildRow = env.createRow({ requesterId: 'user-beta' });
      env.component['allRows'] = [firstRow, secondRow];
      env.setRequesterData('user-alpha', {
        displayName: 'Alpha Display User',
        name: 'Alpha Name User',
        email: 'alpha@example.com'
      });
      env.setRequesterData('user-beta', {
        displayName: 'Beta Display User',
        name: 'Beta Name User',
        email: 'beta@example.com'
      });

      // SUT
      env.component['searchControl'].setValue('alpha name');
      env.waitForRowUpdate();

      expect(env.component['rows']).toEqual([firstRow]);
    }));

    it('filters rows by requester email address', fakeAsync(() => {
      const env = new TestEnvironment();
      const firstRow: ServalBuildRow = env.createRow({ requesterId: 'user-alpha' });
      const secondRow: ServalBuildRow = env.createRow({ requesterId: 'user-beta' });
      env.component['allRows'] = [firstRow, secondRow];
      env.setRequesterData('user-alpha', {
        displayName: 'Alpha Display User',
        name: 'Alpha Name User',
        email: 'alpha@example.com'
      });
      env.setRequesterData('user-beta', {
        displayName: 'Beta Display User',
        name: 'Beta Name User',
        email: 'beta@example.com'
      });

      // SUT
      env.component['searchControl'].setValue('alpha@example.com');
      env.waitForRowUpdate();

      expect(env.component['rows']).toEqual([firstRow]);
    }));

    it('filters rows by project short name and project name', fakeAsync(() => {
      const env = new TestEnvironment();
      const matchingRow: ServalBuildRow = env.createRow({
        projectShortName: 'ABC',
        projectName: 'Alpha Build Project'
      });
      const otherRow: ServalBuildRow = env.createRow({
        projectShortName: 'XYZ',
        projectName: 'Other Build Project'
      });
      env.component['allRows'] = [matchingRow, otherRow];

      env.component['searchControl'].setValue('abc');
      env.waitForRowUpdate();
      const rowsByShortName: ServalBuildRow[] = [...env.component['rows']];

      env.component['searchControl'].setValue('alpha build project');
      env.waitForRowUpdate();
      const rowsByName: ServalBuildRow[] = [...env.component['rows']];

      expect(rowsByShortName).toEqual([matchingRow]);
      expect(rowsByName).toEqual([matchingRow]);
    }));

    it('filters rows by training or translation reference project short/name', fakeAsync(() => {
      const env = new TestEnvironment();
      const matchingTrainingReference: ProjectBooks[] = [
        {
          sfProjectId: 'train-1',
          projectDisplayName: 'TRN - Training Reference Project',
          shortName: 'TRN',
          projectName: 'Training Reference Project',
          booksAndChapters: [{ bookId: 'GEN' }, { bookId: 'EXO' }]
        }
      ];
      const matchingTranslationReference: ProjectBooks[] = [
        {
          sfProjectId: 'trans-1',
          projectDisplayName: 'TLR - Translation Reference Project',
          shortName: 'TLR',
          projectName: 'Translation Reference Project',
          booksAndChapters: [{ bookId: 'MRK' }]
        }
      ];
      const matchingRow: ServalBuildRow = env.createRow({
        trainingBooks: matchingTrainingReference,
        translationBooks: matchingTranslationReference
      });
      const otherRow: ServalBuildRow = env.createRow({
        trainingBooks: [
          {
            sfProjectId: 'train-2',
            projectDisplayName: 'OTR - Other Training Project',
            shortName: 'OTR',
            projectName: 'Other Training Project',
            booksAndChapters: [{ bookId: 'LUK' }]
          }
        ],
        translationBooks: []
      });
      env.component['allRows'] = [matchingRow, otherRow];

      env.component['searchControl'].setValue('trn');
      env.waitForRowUpdate();
      const rowsByTrainingShortName: ServalBuildRow[] = [...env.component['rows']];

      env.component['searchControl'].setValue('translation reference project');
      env.waitForRowUpdate();
      const rowsByTranslationName: ServalBuildRow[] = [...env.component['rows']];

      expect(rowsByTrainingShortName).toEqual([matchingRow]);
      expect(rowsByTranslationName).toEqual([matchingRow]);
    }));

    it('filters rows by referenced book code', fakeAsync(() => {
      const env = new TestEnvironment();
      const matchingRow: ServalBuildRow = env.createRow({
        trainingBooks: env.createProjectBooks('train-1', ['GEN'])
      });
      const otherRow: ServalBuildRow = env.createRow({
        trainingBooks: env.createProjectBooks('train-2', ['LUK'])
      });
      env.component['allRows'] = [matchingRow, otherRow];

      // SUT
      env.component['searchControl'].setValue('gen');
      env.waitForRowUpdate();

      expect(env.component['rows']).toEqual([matchingRow]);
    }));

    it('clearSearch clears search text and resets filtered rows', fakeAsync(() => {
      const env = new TestEnvironment();
      const matchingRow: ServalBuildRow = env.createRow({ projectId: 'sf-project-123' });
      const otherRow: ServalBuildRow = env.createRow({ projectId: 'sf-project-999' });
      env.component['allRows'] = [matchingRow, otherRow];

      env.component['searchControl'].setValue('project-123');
      env.waitForRowUpdate();
      expect(env.component['rows']).toEqual([matchingRow]);

      // SUT
      env.component['clearSearch']();
      env.waitForRowUpdate();

      expect(env.component['searchControl'].value).toBe('');
      expect(env.component['rows']).toEqual([matchingRow, otherRow]);
    }));

    it('uses query param q to set search text and filter rows', fakeAsync(() => {
      const env = new TestEnvironment();
      const matchingRow: ServalBuildRow = env.createRow({ projectId: 'sf-project-123' });
      const otherRow: ServalBuildRow = env.createRow({ projectId: 'sf-project-999' });
      env.component['allRows'] = [matchingRow, otherRow];

      // SUT
      env.component.ngOnInit();
      env.queryParams$.next({ q: 'project-123' });
      env.waitForRowUpdate();

      expect(env.component['searchControl'].value).toBe('project-123');
      expect(env.component['rows']).toEqual([matchingRow]);
    }));

    it('updates query param q when search text changes', fakeAsync(() => {
      const env = new TestEnvironment();
      const navigateSpy = spyOn(env.component['router'], 'navigate').and.resolveTo(true);

      // SUT
      env.component['searchControl'].setValue('project-123');
      env.waitForRowUpdate();

      expect(navigateSpy).toHaveBeenCalledWith(
        [],
        jasmine.objectContaining({
          queryParams: { q: 'project-123' },
          queryParamsHandling: 'merge'
        })
      );
    }));

    it('clears query param q when search text is cleared', fakeAsync(() => {
      const env = new TestEnvironment();
      const navigateSpy = spyOn(env.component['router'], 'navigate').and.resolveTo(true);

      env.component['searchControl'].setValue('project-123');
      env.waitForRowUpdate();
      navigateSpy.calls.reset();

      // SUT
      env.component['searchControl'].setValue('');
      env.waitForRowUpdate();

      expect(navigateSpy).toHaveBeenCalledWith(
        [],
        jasmine.objectContaining({
          queryParams: { q: null },
          queryParamsHandling: 'merge'
        })
      );
    }));
  });

  describe('summary stats', () => {
    it('returns undefined average requesters when a requester is missing', () => {
      // Suppose some builds for a project have a record of who requested them, and some builds for that or another
      // project don't. We can't very meaningfully determine the "average" number of requesters per project in this
      // situation. So the average will be undefined.

      const env = new TestEnvironment();
      const baseStart: Date = new Date('2024-01-01T00:00:00Z');
      const rows: any[] = [
        env.createRow({
          projectId: 'project-a',
          servalCreated: env.addHours(baseStart, 0),
          servalFinished: env.addHours(baseStart, 1),
          requesterId: 'user-1',
          status: DraftGenerationBuildStatus.Completed
        }),
        env.createRow({
          projectId: 'project-a',
          servalCreated: env.addHours(baseStart, 2),
          servalFinished: env.addHours(baseStart, 3),
          requesterId: null,
          status: DraftGenerationBuildStatus.Completed
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
        env.createRow({
          projectId: 'proj-a',
          sfUserRequested: null,
          servalCreated: env.addHours(baseStart, 0),
          servalFinished: env.addHours(baseStart, 1),
          sfAcknowledgedCompletion: null,
          requesterId: 'user-1',
          trainingBooks: env.createProjectBooks('proj-a', ['GEN', 'EXO']),
          translationBooks: env.createProjectBooks('proj-a', ['PSA']),
          status: DraftGenerationBuildStatus.Completed
        }),
        env.createRow({
          projectId: 'proj-a',
          sfUserRequested: null,
          servalCreated: env.addHours(baseStart, 3),
          servalFinished: env.addHours(baseStart, 4),
          sfAcknowledgedCompletion: null,
          requesterId: 'user-2',
          trainingBooks: env.createProjectBooks('proj-a', ['MRK']),
          translationBooks: [],
          status: DraftGenerationBuildStatus.Completed
        }),
        env.createRow({
          projectId: 'proj-a',
          sfUserRequested: null,
          servalCreated: env.addHours(baseStart, 7),
          servalFinished: env.addHours(baseStart, 8),
          sfAcknowledgedCompletion: null,
          requesterId: 'user-2',
          trainingBooks: env.createProjectBooks('proj-a', ['ROM', '1CO', '2CO']),
          translationBooks: env.createProjectBooks('proj-a', ['MAT', 'LUK']),
          problems: [{ source: 'serval', severity: 'warning', message: 'Low confidence' }],
          status: DraftGenerationBuildStatus.Completed
        }),
        env.createRow({
          projectId: 'proj-b',
          sfUserRequested: null,
          servalCreated: env.addHours(baseStart, 2),
          servalFinished: env.addHours(baseStart, 2.5),
          sfAcknowledgedCompletion: null,
          requesterId: 'user-2',
          trainingBooks: [],
          translationBooks: [],
          status: DraftGenerationBuildStatus.Active
        }),
        env.createRow({
          projectId: 'proj-b',
          sfUserRequested: null,
          servalCreated: env.addHours(baseStart, 5),
          servalFinished: env.addHours(baseStart, 6),
          sfAcknowledgedCompletion: null,
          requesterId: 'user-3',
          trainingBooks: env.createProjectBooks('proj-b', ['ACT']),
          translationBooks: env.createProjectBooks('proj-b', ['ISA', 'JER', 'EZE']),
          status: DraftGenerationBuildStatus.Faulted
        }),
        env.createRow({
          projectId: 'proj-c',
          sfUserRequested: null,
          servalCreated: env.addHours(baseStart, 9),
          servalFinished: env.addHours(baseStart, 10),
          sfAcknowledgedCompletion: null,
          requesterId: 'user-4',
          trainingBooks: [],
          translationBooks: [],
          status: DraftGenerationBuildStatus.Pending
        }),
        // This build could not be associated with a project.
        env.createRow({
          projectId: null,
          projectDeleted: true,
          sfUserRequested: null,
          servalCreated: env.addHours(baseStart, 11),
          servalFinished: env.addHours(baseStart, 12),
          sfAcknowledgedCompletion: null,
          trainingBooks: [],
          translationBooks: [],
          status: DraftGenerationBuildStatus.Pending
        })
      ];

      // SUT
      const summary = buildSummary(rows);

      expect(summary.totalBuilds).toBe(6);
      expect(summary.totalProjects).toBe(3);
      expect(summary.buildsPerProject).toBeCloseTo(2);
      expect(summary.averageInterBuildTimeMs).toBeCloseTo(9000000);
      expect(summary.totalRequesters).toBe(4);
      expect(summary.averageRequestersPerProject).toBeCloseTo(1.667);
      expect(summary.faultedBuilds).toBe(1);
      expect(summary.averageTrainingBooksPerBuild).toBeCloseTo(1.1666666667);
      expect(summary.averageTranslationBooksPerBuild).toBeCloseTo(1);
      expect(summary.totalUniqueTrainingBooks).toBe(7);
      expect(summary.totalTrainingBooks).toBe(7);
      expect(summary.totalUniqueTranslationBooks).toBe(6);
      expect(summary.totalTranslationBooks).toBe(6);
      expect(summary.completedBuilds).toBe(3);
      expect(summary.inProgressBuilds).toBe(2);
      expect(summary.buildsWithProblems).toBe(1);
      expect(summary.unconsideredBuilds).toBe(1);
      expect(summary.meanDurationMs).toBe(3600000);
      expect(summary.maxDurationMs).toBe(3600000);
      // All rows created above with createRow have a servalBuild and no events, so all are "SF did not know about"
      expect(summary.buildsServalDidNotKnowAbout).toBe(0);
      expect(summary.buildsSfDidNotKnowAbout).toBe(6);
    });

    it('counts total and unique training books', () => {
      const env = new TestEnvironment();
      const baseStart: Date = new Date('2024-01-01T00:00:00Z');
      const rows: ServalBuildRow[] = [
        env.createRow({
          projectId: 'proj-a',
          servalCreated: env.addHours(baseStart, 0),
          servalFinished: env.addHours(baseStart, 1),
          requesterId: 'user-1',
          trainingBooks: env.createProjectBooks('proj-a', ['GEN', 'EXO']),
          status: DraftGenerationBuildStatus.Completed
        }),
        env.createRow({
          projectId: 'proj-b',
          servalCreated: env.addHours(baseStart, 2),
          servalFinished: env.addHours(baseStart, 3),
          requesterId: 'user-2',
          trainingBooks: env.createProjectBooks('proj-b', ['GEN']),
          status: DraftGenerationBuildStatus.Completed
        }),
        env.createRow({
          projectId: 'proj-c',
          servalCreated: env.addHours(baseStart, 4),
          servalFinished: env.addHours(baseStart, 5),
          requesterId: 'user-3',
          trainingBooks: env.createProjectBooks('proj-c', ['LEV']),
          status: DraftGenerationBuildStatus.Completed
        })
      ];

      // SUT
      const summary: ServalBuildSummary = buildSummary(rows);

      // Total books includes duplicates: [GEN, EXO, GEN, LEV] => 4
      expect(summary.totalTrainingBooks).toBe(4);
      // Unique books dedupe by book code globally: [GEN, EXO, LEV] => 3
      expect(summary.totalUniqueTrainingBooks).toBe(3);
    });

    it('counts total and unique translation books', () => {
      const env = new TestEnvironment();
      const baseStart: Date = new Date('2024-01-01T00:00:00Z');
      const rows: ServalBuildRow[] = [
        env.createRow({
          projectId: 'proj-a',
          servalCreated: env.addHours(baseStart, 0),
          servalFinished: env.addHours(baseStart, 1),
          requesterId: 'user-1',
          translationBooks: env.createProjectBooks('proj-a', ['GEN', 'EXO']),
          status: DraftGenerationBuildStatus.Completed
        }),
        env.createRow({
          projectId: 'proj-b',
          servalCreated: env.addHours(baseStart, 2),
          servalFinished: env.addHours(baseStart, 3),
          requesterId: 'user-2',
          translationBooks: env.createProjectBooks('proj-b', ['GEN']),
          status: DraftGenerationBuildStatus.Completed
        }),
        env.createRow({
          projectId: 'proj-c',
          servalCreated: env.addHours(baseStart, 4),
          servalFinished: env.addHours(baseStart, 5),
          requesterId: 'user-3',
          translationBooks: env.createProjectBooks('proj-c', ['LEV']),
          status: DraftGenerationBuildStatus.Completed
        })
      ];

      // SUT
      const summary: ServalBuildSummary = buildSummary(rows);

      // Total books includes duplicates: [GEN, EXO, GEN, LEV] => 4
      expect(summary.totalTranslationBooks).toBe(4);
      // Unique books dedupe by book code globally: [GEN, EXO, LEV] => 3
      expect(summary.totalUniqueTranslationBooks).toBe(3);
    });

    it('excludes unconsidered builds from book totals', () => {
      const env = new TestEnvironment();
      const baseStart: Date = new Date('2024-01-01T00:00:00Z');
      const rows: ServalBuildRow[] = [
        env.createRow({
          projectId: 'proj-a',
          servalCreated: env.addHours(baseStart, 0),
          servalFinished: env.addHours(baseStart, 1),
          requesterId: 'user-1',
          trainingBooks: env.createProjectBooks('proj-a', ['GEN', 'EXO']),
          translationBooks: env.createProjectBooks('proj-a', ['PSA']),
          status: DraftGenerationBuildStatus.Completed
        }),
        env.createRow({
          projectId: null,
          projectDeleted: true,
          servalCreated: env.addHours(baseStart, 2),
          servalFinished: env.addHours(baseStart, 3),
          requesterId: null,
          trainingBooks: env.createProjectBooks('proj-orphan', ['LEV', 'NUM']),
          translationBooks: env.createProjectBooks('proj-orphan', ['ROM', 'ACT']),
          status: DraftGenerationBuildStatus.Completed
        })
      ];

      // SUT
      const summary: ServalBuildSummary = buildSummary(rows);

      expect(summary.totalBuilds).toBe(1);
      expect(summary.unconsideredBuilds).toBe(1);
      // The unconsidered build's books should not contribute to listed totals.
      expect(summary.totalTrainingBooks).toBe(2);
      expect(summary.totalUniqueTrainingBooks).toBe(2);
      expect(summary.totalTranslationBooks).toBe(1);
      expect(summary.totalUniqueTranslationBooks).toBe(1);
    });

    it('handles book counting despite chapter numbers present', () => {
      const env = new TestEnvironment();
      const baseStart: Date = new Date('2024-01-01T00:00:00Z');
      const rows: ServalBuildRow[] = [
        env.createRow({
          projectId: 'proj-a',
          servalCreated: env.addHours(baseStart, 0),
          servalFinished: env.addHours(baseStart, 1),
          requesterId: 'user-1',
          trainingBooks: env.createProjectBooks('proj-a', ['GEN1', 'EXO1-10,14']),
          status: DraftGenerationBuildStatus.Completed
        }),
        env.createRow({
          projectId: 'proj-b',
          servalCreated: env.addHours(baseStart, 2),
          servalFinished: env.addHours(baseStart, 3),
          requesterId: 'user-2',
          trainingBooks: env.createProjectBooks('proj-b', ['GEN1', 'EXO']),
          status: DraftGenerationBuildStatus.Completed
        }),
        env.createRow({
          projectId: 'proj-c',
          servalCreated: env.addHours(baseStart, 4),
          servalFinished: env.addHours(baseStart, 5),
          requesterId: 'user-3',
          trainingBooks: env.createProjectBooks('proj-c', ['GEN2', 'LEV']),
          status: DraftGenerationBuildStatus.Completed
        }),
        env.createRow({
          projectId: 'proj-d',
          servalCreated: env.addHours(baseStart, 6),
          servalFinished: env.addHours(baseStart, 7),
          requesterId: 'user-3',
          trainingBooks: env.createProjectBooks('proj-c', ['GEN']),
          status: DraftGenerationBuildStatus.Completed
        })
      ];

      // SUT
      const summary: ServalBuildSummary = buildSummary(rows);

      // Total books includes duplicates and is not influenced by chapter
      // indications: [GEN, EXO, GEN, EXO, GEN, LEV, GEN] => 7
      expect(summary.totalTrainingBooks).toBe(7);
      // Unique books dedupe by book code globally, and is not influenced
      // by chapter indications: [GEN, EXO, LEV] => 3
      expect(summary.totalUniqueTrainingBooks).toBe(3);
    });

    it('counts unique books by first three characters even for non-standard tokens', () => {
      const env = new TestEnvironment();
      const baseStart: Date = new Date('2024-01-01T00:00:00Z');
      const rows: ServalBuildRow[] = [
        env.createRow({
          projectId: 'proj-a',
          servalCreated: env.addHours(baseStart, 0),
          servalFinished: env.addHours(baseStart, 1),
          requesterId: 'user-1',
          trainingBooks: env.createProjectBooks('proj-a', ['ABC1', 'ABC2']),
          status: DraftGenerationBuildStatus.Completed
        }),
        env.createRow({
          projectId: 'proj-b',
          servalCreated: env.addHours(baseStart, 2),
          servalFinished: env.addHours(baseStart, 3),
          requesterId: 'user-2',
          trainingBooks: env.createProjectBooks('proj-b', ['1234', '1235']),
          status: DraftGenerationBuildStatus.Completed
        })
      ];

      // SUT
      const summary: ServalBuildSummary = buildSummary(rows);

      // Total books: [ABC, ABC, 123, 123] => 4
      expect(summary.totalTrainingBooks).toBe(4);
      // Unique books dedupe by first three characters: [ABC, 123] => 2
      expect(summary.totalUniqueTrainingBooks).toBe(2);
    });

    it('uses only completed builds for mean duration', () => {
      const env = new TestEnvironment();
      const baseStart: Date = new Date('2024-01-01T00:00:00Z');

      const rows = [
        env.createRow({
          projectId: 'proj-a',
          servalCreated: env.addHours(baseStart, 0),
          servalFinished: env.addHours(baseStart, 2),
          requesterId: 'user-1',
          status: DraftGenerationBuildStatus.Completed
        }),
        env.createRow({
          projectId: 'proj-a',
          servalCreated: env.addHours(baseStart, 3),
          servalFinished: env.addHours(baseStart, 4),
          requesterId: 'user-1',
          status: DraftGenerationBuildStatus.Completed
        }),
        env.createRow({
          projectId: 'proj-a',
          servalCreated: env.addHours(baseStart, 5),
          servalFinished: env.addHours(baseStart, 10),
          requesterId: 'user-1',
          status: DraftGenerationBuildStatus.Active
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
          env.createRow({
            projectId: `project-${index}`,
            servalCreated: env.addHours(baseStart, index * 2),
            servalFinished: env.addHours(baseStart, index * 2 + 1),
            requesterId: requesterId,
            status: DraftGenerationBuildStatus.Completed
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
          env.createRow({
            projectId: 'project-1',
            servalCreated: env.addHours(baseStart, index * 2),
            servalFinished: env.addHours(baseStart, index * 2 + 1),
            requesterId: requesterId,
            status: DraftGenerationBuildStatus.Completed
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
          env.createRow({
            projectId: 'project-a',
            servalCreated: env.addHours(baseStart, index * 2),
            servalFinished: env.addHours(baseStart, index * 2 + 1),
            requesterId: 'user-1',
            status: DraftGenerationBuildStatus.Completed
          })
        );
      }

      for (let index = 0; index < totalBuildsPerProject; index++) {
        const requesterId: string = index < 25 ? 'user-1' : 'user-2';
        rows.push(
          env.createRow({
            projectId: 'project-b',
            servalCreated: env.addHours(baseStart, index * 2),
            servalFinished: env.addHours(baseStart, index * 2 + 1),
            requesterId: requesterId,
            status: DraftGenerationBuildStatus.Completed
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
        env.createRow({
          projectId: 'proj-a',
          sfUserRequested: env.addHours(baseStart, 0),
          servalCreated: env.addHours(baseStart, 0),
          servalFinished: env.addHours(baseStart, 1),
          requesterId: 'user-1',
          trainingBooks: env.createProjectBooks('proj-a', ['GEN', 'EXO']),
          translationBooks: env.createProjectBooks('proj-a', ['PSA']),
          status: DraftGenerationBuildStatus.Completed,
          hasServalBuild: true,
          hasEvents: true
        }),
        // Build with Serval data - has 3 training books and 2 translation books
        env.createRow({
          projectId: 'proj-a',
          sfUserRequested: env.addHours(baseStart, 2),
          servalCreated: env.addHours(baseStart, 2),
          servalFinished: env.addHours(baseStart, 3),
          requesterId: 'user-1',
          trainingBooks: env.createProjectBooks('proj-a', ['MRK', 'LUK', 'JHN']),
          translationBooks: env.createProjectBooks('proj-a', ['MAT', 'ROM']),
          status: DraftGenerationBuildStatus.Completed,
          hasServalBuild: true,
          hasEvents: true
        }),
        // Events-only build - has no Serval data, so no book info is present
        // This should not be counted in the book averages denominator
        env.createRow({
          projectId: 'proj-b',
          sfUserRequested: env.addHours(baseStart, 4),
          servalCreated: null,
          servalFinished: null,
          requesterId: 'user-2',
          trainingBooks: [],
          translationBooks: [],
          status: DraftGenerationBuildStatus.Completed,
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
        env.createRow({
          projectId: 'proj-a',
          sfUserRequested: env.addHours(baseStart, 0),
          servalCreated: env.addHours(baseStart, 0),
          servalFinished: env.addHours(baseStart, 1),
          requesterId: 'user-1',
          status: DraftGenerationBuildStatus.Completed,
          hasServalBuild: true,
          hasEvents: true
        }),
        // Build with events only - no Serval data (Serval did not know about)
        env.createRow({
          projectId: 'proj-a',
          sfUserRequested: env.addHours(baseStart, 2),
          servalCreated: null,
          servalFinished: null,
          requesterId: 'user-1',
          status: DraftGenerationBuildStatus.Completed,
          hasServalBuild: false,
          hasEvents: true
        }),
        // Another build with events only (Serval did not know about)
        env.createRow({
          projectId: 'proj-b',
          sfUserRequested: env.addHours(baseStart, 4),
          servalCreated: null,
          servalFinished: null,
          requesterId: 'user-2',
          status: DraftGenerationBuildStatus.Active,
          hasServalBuild: false,
          hasEvents: true
        }),
        // Build without SF project ID (unconsidered - should not count).
        env.createRow({
          projectId: null,
          projectDeleted: true,
          sfUserRequested: env.addHours(baseStart, 6),
          servalCreated: null,
          servalFinished: null,
          requesterId: null,
          status: DraftGenerationBuildStatus.Pending,
          hasServalBuild: false,
          // This record doesn't really make sense, if the record has events, but not projectId. But it is
          // included as part of specification and testing.
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
        env.createRow({
          projectId: 'proj-a',
          sfUserRequested: env.addHours(baseStart, 0),
          servalCreated: env.addHours(baseStart, 0),
          servalFinished: env.addHours(baseStart, 1),
          requesterId: 'user-1',
          status: DraftGenerationBuildStatus.Completed,
          hasServalBuild: true,
          hasEvents: true
        }),
        // Build with Serval data only - no SF events (SF did not know about)
        env.createRow({
          projectId: 'proj-a',
          sfUserRequested: null,
          servalCreated: env.addHours(baseStart, 2),
          servalFinished: env.addHours(baseStart, 3),
          sfAcknowledgedCompletion: null,
          requesterId: null,
          draftGenerationRequestId: null,
          status: DraftGenerationBuildStatus.Completed,
          hasServalBuild: true,
          hasEvents: false
        }),
        // Another build with Serval data only (SF did not know about)
        env.createRow({
          projectId: 'proj-b',
          sfUserRequested: null,
          servalCreated: env.addHours(baseStart, 4),
          servalFinished: env.addHours(baseStart, 5),
          sfAcknowledgedCompletion: null,
          requesterId: null,
          draftGenerationRequestId: null,
          status: DraftGenerationBuildStatus.Active,
          hasServalBuild: true,
          hasEvents: false
        }),
        // Build without SF project ID (unconsidered - should not count)
        env.createRow({
          projectId: null,
          projectDeleted: true,
          sfUserRequested: null,
          servalCreated: env.addHours(baseStart, 6),
          servalFinished: env.addHours(baseStart, 7),
          sfAcknowledgedCompletion: null,
          requesterId: null,
          draftGenerationRequestId: null,
          status: DraftGenerationBuildStatus.Pending,
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
        env.createRow({
          projectId: 'proj-a',
          servalCreated: env.addHours(baseStart, 0),
          servalFinished: env.addHours(baseStart, 1),
          sfAcknowledgedCompletion: env.addHours(baseStart, 1.5),
          requesterId: 'user-1',
          status: DraftGenerationBuildStatus.Completed
        }),
        env.createRow({
          projectId: 'proj-a',
          sfUserRequested: env.addHours(baseStart, 3),
          servalCreated: env.addHours(baseStart, 4),
          servalFinished: env.addHours(baseStart, 5),
          requesterId: 'user-1',
          status: DraftGenerationBuildStatus.Completed
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
        env.createRow({
          projectId: 'proj-a',
          sfUserRequested: null,
          servalCreated: env.addHours(baseStart, 0),
          servalFinished: env.addHours(baseStart, 1),
          sfAcknowledgedCompletion: null,
          requesterId: 'user-1',
          status: DraftGenerationBuildStatus.Completed
        }),
        env.createRow({
          projectId: 'proj-a',
          sfUserRequested: null,
          servalCreated: env.addHours(baseStart, 4),
          servalFinished: env.addHours(baseStart, 5),
          sfAcknowledgedCompletion: null,
          requesterId: 'user-1',
          status: DraftGenerationBuildStatus.Completed
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
        env.createRow({
          projectId: 'proj-a',
          sfUserRequested: null,
          servalCreated: env.addHours(baseStart, 0),
          servalFinished: env.addHours(baseStart, 1),
          sfAcknowledgedCompletion: null,
          requesterId: 'user-1',
          status: DraftGenerationBuildStatus.Completed
        }),
        env.createRow({
          projectId: 'proj-a',
          sfUserRequested: null,
          servalCreated: env.addHours(baseStart, 2),
          servalFinished: env.addHours(baseStart, 3),
          sfAcknowledgedCompletion: null,
          requesterId: 'user-1',
          status: DraftGenerationBuildStatus.Completed
        }),
        env.createRow({
          projectId: 'proj-a',
          sfUserRequested: null,
          servalCreated: env.addHours(baseStart, 6),
          servalFinished: env.addHours(baseStart, 7),
          sfAcknowledgedCompletion: null,
          requesterId: 'user-1',
          status: DraftGenerationBuildStatus.Completed
        }),
        env.createRow({
          projectId: 'proj-b',
          sfUserRequested: null,
          servalCreated: env.addHours(baseStart, 0),
          servalFinished: env.addHours(baseStart, 1),
          sfAcknowledgedCompletion: null,
          requesterId: 'user-2',
          status: DraftGenerationBuildStatus.Completed
        }),
        env.createRow({
          projectId: 'proj-b',
          sfUserRequested: null,
          servalCreated: env.addHours(baseStart, 2),
          servalFinished: env.addHours(baseStart, 3),
          sfAcknowledgedCompletion: null,
          requesterId: 'user-2',
          status: DraftGenerationBuildStatus.Completed
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
        env.createRow({
          projectId: 'proj-a',
          sfUserRequested: env.addHours(baseStart, 0),
          servalCreated: env.addHours(baseStart, 2),
          servalFinished: env.addHours(baseStart, 8),
          sfAcknowledgedCompletion: env.addHours(baseStart, 10),
          requesterId: 'user-1',
          status: DraftGenerationBuildStatus.Completed
        }),
        env.createRow({
          projectId: 'proj-b',
          sfUserRequested: env.addHours(baseStart, 0),
          servalCreated: env.addHours(baseStart, 2),
          servalFinished: env.addHours(baseStart, 6),
          sfAcknowledgedCompletion: env.addHours(baseStart, 8),
          requesterId: 'user-2',
          status: DraftGenerationBuildStatus.Completed
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
        env.createRow({
          projectId: 'proj-a',
          sfUserRequested: env.addHours(baseStart, 0),
          servalCreated: env.addHours(baseStart, 2),
          servalFinished: env.addHours(baseStart, 8),
          sfAcknowledgedCompletion: env.addHours(baseStart, 10),
          requesterId: 'user-1',
          // This one counts: 40% SF time
          status: DraftGenerationBuildStatus.Completed
        }),
        env.createRow({
          projectId: 'proj-b',
          sfUserRequested: env.addHours(baseStart, 0),
          servalCreated: env.addHours(baseStart, 2),
          servalFinished: env.addHours(baseStart, 4),
          sfAcknowledgedCompletion: env.addHours(baseStart, 20),
          requesterId: 'user-2',
          // In progress - should be excluded
          status: DraftGenerationBuildStatus.Active
        }),
        env.createRow({
          projectId: 'proj-c',
          sfUserRequested: env.addHours(baseStart, 0),
          servalCreated: env.addHours(baseStart, 2),
          servalFinished: env.addHours(baseStart, 4),
          sfAcknowledgedCompletion: env.addHours(baseStart, 20),
          requesterId: 'user-3',
          // Faulted - should be excluded
          status: DraftGenerationBuildStatus.Faulted
        }),
        env.createRow({
          projectId: 'proj-d',
          sfUserRequested: env.addHours(baseStart, 0),
          servalCreated: env.addHours(baseStart, 2),
          servalFinished: env.addHours(baseStart, 4),
          sfAcknowledgedCompletion: env.addHours(baseStart, 20),
          requesterId: 'user-4',
          // Cancelled - should be excluded
          status: DraftGenerationBuildStatus.Canceled
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
        env.createRow({
          projectId: 'proj-a',
          // Missing sfUserRequested.
          sfUserRequested: null,
          servalCreated: env.addHours(baseStart, 2),
          servalFinished: env.addHours(baseStart, 8),
          sfAcknowledgedCompletion: env.addHours(baseStart, 10),
          requesterId: 'user-1',
          status: DraftGenerationBuildStatus.Completed
        }),
        env.createRow({
          projectId: 'proj-b',
          sfUserRequested: env.addHours(baseStart, 0),
          servalCreated: env.addHours(baseStart, 2),
          servalFinished: env.addHours(baseStart, 8),
          // Missing sfAcknowledgedCompletion
          sfAcknowledgedCompletion: null,
          requesterId: 'user-2',
          status: DraftGenerationBuildStatus.Completed
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
        env.createRow({
          projectId: 'proj-valid',
          sfUserRequested: env.addHours(baseStart, 0),
          servalCreated: env.addHours(baseStart, 2),
          servalFinished: env.addHours(baseStart, 8),
          sfAcknowledgedCompletion: env.addHours(baseStart, 10),
          requesterId: 'user-1',
          status: DraftGenerationBuildStatus.Completed
        }),
        env.createRow({
          projectId: 'proj-invalid-total',
          sfUserRequested: env.addHours(baseStart, 10),
          servalCreated: env.addHours(baseStart, 2),
          servalFinished: env.addHours(baseStart, 4),
          // Invalid total duration: acknowledgment before request
          sfAcknowledgedCompletion: env.addHours(baseStart, 8),
          requesterId: 'user-2',
          status: DraftGenerationBuildStatus.Completed
        }),
        env.createRow({
          projectId: 'proj-invalid-serval',
          sfUserRequested: env.addHours(baseStart, 0),
          servalCreated: env.addHours(baseStart, 7),
          // Invalid Serval duration: finish before created
          servalFinished: env.addHours(baseStart, 6),
          sfAcknowledgedCompletion: env.addHours(baseStart, 10),
          requesterId: 'user-3',
          status: DraftGenerationBuildStatus.Completed
        }),
        env.createRow({
          projectId: 'proj-invalid-overlap',
          sfUserRequested: env.addHours(baseStart, 0),
          servalCreated: env.addHours(baseStart, 1),
          servalFinished: env.addHours(baseStart, 8),
          // Invalid overlap: Serval runtime longer than full lifecycle in SF
          sfAcknowledgedCompletion: env.addHours(baseStart, 5),
          requesterId: 'user-4',
          status: DraftGenerationBuildStatus.Completed
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
        // Build 1: has Serval data, finishes at hour 1 (servalFinished). No sfAcknowledgedCompletion, so the gap
        // calculation will fall back to servalFinished for the "previous finish" time.
        env.createRow({
          projectId: 'proj-a',
          sfUserRequested: env.addHours(baseStart, 0),
          servalCreated: env.addHours(baseStart, 0),
          servalFinished: env.addHours(baseStart, 1),
          sfAcknowledgedCompletion: null,
          hasServalBuild: true
        }),
        // Build 2: NO Serval data (hasServalBuild=false), so servalFinished is not set. Since sfAcknowledgedCompletion
        // is also not set, this build has no known finish time.
        env.createRow({
          projectId: 'proj-a',
          sfUserRequested: env.addHours(baseStart, 3),
          servalCreated: null,
          servalFinished: null,
          sfAcknowledgedCompletion: null,
          hasServalBuild: false
        }),
        // Build 3: has Serval data, starts at hour 6.
        env.createRow({
          projectId: 'proj-a',
          sfUserRequested: env.addHours(baseStart, 6),
          servalCreated: env.addHours(baseStart, 6),
          servalFinished: env.addHours(baseStart, 7),
          sfAcknowledgedCompletion: null,
          hasServalBuild: true
        })
      ];

      // SUT
      const gaps: Array<number | undefined> = gapsBetweenBuildsMs(rows);
      const summary = buildSummary(rows);

      expect(gaps.length).toBe(2);
      // Gap 1→2: Build 1 finishes (servalFinished) at hour 1, Build 2 starts (sfUserRequested) at hour 3 = 2h gap.
      expect(gaps[0]).toBe(2 * 60 * 60 * 1000);
      // Gap 2→3: Build 2 has no finish time (no sfAcknowledgedCompletion and no servalFinished), so the gap is unknown.
      expect(gaps[1]).toBeUndefined();
      // The average only counts known gaps, so the average is just the 2h gap.
      expect(summary.averageInterBuildTimeMs).toBe(2 * 60 * 60 * 1000);
    });

    it('records undefined gap and logs error when consecutive builds have overlapping durations', () => {
      const env = new TestEnvironment();
      mockedConsole.reset();
      mockedConsole.expectAndHide(/Two consecutive builds \(build-id1, build-id2\) have overlapping durations\./);
      const baseStart: Date = new Date('2024-01-01T00:00:00Z');
      // Build 1 finishes at hour 5, but build 2 starts at hour 3 — the next build started before the previous
      // finished, so the gap is negative (overlapping).
      const rows = [
        env.createRow({
          projectId: 'proj-a',
          sfUserRequested: env.addHours(baseStart, 0),
          servalCreated: env.addHours(baseStart, 0),
          servalFinished: env.addHours(baseStart, 5),
          servalBuildId: 'build-id1',
          hasServalBuild: true
        }),
        env.createRow({
          projectId: 'proj-a',
          sfUserRequested: env.addHours(baseStart, 3),
          servalCreated: env.addHours(baseStart, 3),
          servalFinished: env.addHours(baseStart, 6),
          servalBuildId: 'build-id2',
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

      const rowWithSfTimestamps: ServalBuildRow = env.createRow({
        projectId: 'proj-1',
        sfUserRequested: sfUserRequestTime,
        servalCreated: servalCreated,
        servalFinished: servalFinished,
        sfAcknowledgedCompletion: sfAcknowledgedTime
      });
      const rowWithServalOnly: ServalBuildRow = env.createRow({
        projectId: 'proj-2',
        sfUserRequested: null,
        servalCreated: servalCreated,
        servalFinished: servalFinished,
        sfAcknowledgedCompletion: null
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

      const row: ServalBuildRow = env.createRow({
        projectId: 'proj-1',
        sfUserRequested: sfUserRequestTime,
        servalCreated: new Date('2024-06-01T08:05:00Z'),
        servalFinished: new Date('2024-06-01T09:55:00Z'),
        sfAcknowledgedCompletion: sfAcknowledgedTime
      });

      // SUT
      const result: SpreadsheetRow[] = ServalBuildsComponent['createSpreadsheetRows']([row]);

      // Duration should be based on SF timestamps: 2 hours = 120 minutes
      expect(result[0].durationMinutes).toBe('120');
    });
  });

  describe('formatProjectBooks', () => {
    it('includes the SF project ID and short name before the colon when short name is available', () => {
      const projectBooks: ProjectBooks[] = [
        {
          sfProjectId: '112233',
          projectDisplayName: 'BSB - Berean Standard Bible',
          shortName: 'BSB',
          booksAndChapters: [{ bookId: 'GEN' }, { bookId: 'EXO' }]
        },
        {
          sfProjectId: '222333',
          projectDisplayName: 'ASV - American Standard Version',
          shortName: 'ASV',
          booksAndChapters: [{ bookId: 'EXO' }, { bookId: 'LEV' }]
        }
      ];

      // SUT
      const result: string = ServalBuildsComponent.formatProjectBooks(projectBooks);

      expect(result).toBe('112233 BSB: GEN; EXO. 222333 ASV: EXO; LEV');
    });

    it('falls back to just the project ID when short name is unavailable', () => {
      const projectBooks: ProjectBooks[] = [
        {
          sfProjectId: '112233',
          projectDisplayName: '112233',
          shortName: undefined,
          booksAndChapters: [{ bookId: 'GEN' }]
        }
      ];

      // SUT
      const result: string = ServalBuildsComponent.formatProjectBooks(projectBooks);

      expect(result).toBe('112233: GEN');
    });

    it('includes chapter numbers in compact range notation', () => {
      const projectBooks: ProjectBooks[] = [
        {
          sfProjectId: '112233',
          projectDisplayName: 'BSB',
          shortName: 'BSB',
          booksAndChapters: [{ bookId: 'GEN', chapters: [10, 11, 16, 17, 18, 19] }, { bookId: 'EXO' }]
        }
      ];

      // SUT
      const result: string = ServalBuildsComponent.formatProjectBooks(projectBooks);

      expect(result).toBe('112233 BSB: GEN 10-11, 16-19; EXO');
    });

    it('compactRangeNotation de-duplicates duplicate chapter numbers', () => {
      // SUT
      const result: string = ServalBuildsComponent.compactRangeNotation([10, 10, 11, 10, 16, 16, 17]);

      expect(result).toBe('10-11, 16-17');
    });
  });

  describe('determineBuildInputs', () => {
    it('builds result with desired info', () => {
      const input: ProjectBooks[] = [
        {
          sfProjectId: 'proj-b-id',
          projectDisplayName: 'B - Project B',
          shortName: 'B',
          projectName: 'Project B',
          booksAndChapters: [{ bookId: 'GEN' }, { bookId: 'EXO' }]
        }
      ];

      const results: BuildInputItem[] = ServalBuildsComponent.determineBuildInputs(input);

      expect(results.length).toBe(1);
      expect(results[0].projectName).toBe('Project B');
      expect(results[0].shortName).toBe('B');
      expect(results[0].sfProjectId).toBe('proj-b-id');
      expect(results[0].projectLink).toBe('/serval-administration/proj-b-id');
      expect(results[0].booksDisplay).toBe('GEN; EXO');
    });

    it('omits missing project name and short name values', () => {
      const input: ProjectBooks[] = [
        {
          sfProjectId: 'proj-c-id',
          projectDisplayName: 'proj-c-id',
          shortName: undefined,
          projectName: undefined,
          booksAndChapters: [{ bookId: 'LEV', chapters: [1, 2, 3] }, { bookId: 'NUM' }]
        }
      ];

      const results: BuildInputItem[] = ServalBuildsComponent.determineBuildInputs(input);

      expect(results.length).toBe(1);
      expect(results[0].projectName).toBeUndefined();
      expect(results[0].shortName).toBeUndefined();
      expect(results[0].sfProjectId).toBe('proj-c-id');
      expect(results[0].booksDisplay).toBe('LEV 1-3; NUM');
    });

    it('returns empty array for undefined or null input', () => {
      expect(ServalBuildsComponent.determineBuildInputs(undefined)).toEqual([]);
      expect(ServalBuildsComponent.determineBuildInputs(null)).toEqual([]);
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

  describe('formatLanguageWithName', () => {
    it('formats code with name', () => {
      const env = new TestEnvironment();
      when(mockI18nService.getLanguageDisplayName('es')).thenReturn('Spanish');

      // SUT
      const formatted: string = env.component['formatLanguageWithName']('es');

      expect(formatted).toBe('es (Spanish)');
    });
  });

  describe('requesting user details', () => {
    it('loads requester name from user data', async () => {
      const env = new TestEnvironment();

      const name: string | undefined = await firstValueFrom(env.component['requesterName']('user02'));

      expect(name).toBe('Test User Name');
    });

    it('loads requester display name from user data', async () => {
      const env = new TestEnvironment();

      const displayName: string | undefined = await firstValueFrom(env.component['requesterDisplayName']('user02'));

      expect(displayName).toBe('Test User');
    });

    it('loads requester email address from user data', async () => {
      const env = new TestEnvironment();

      const emailAddress: string | undefined = await firstValueFrom(env.component['requesterEmailAddress']('user02'));

      expect(emailAddress).toBe('user02@example.com');
    });

    it('updates requester details when changes$ emits', async () => {
      const env = new TestEnvironment();
      const name$: Observable<string | undefined> = env.component['requesterName']('user02');
      const displayName$: Observable<string | undefined> = env.component['requesterDisplayName']('user02');
      const emailAddress$: Observable<string | undefined> = env.component['requesterEmailAddress']('user02');

      expect(await firstValueFrom(name$)).toBe('Test User Name');
      expect(await firstValueFrom(displayName$)).toBe('Test User');
      expect(await firstValueFrom(emailAddress$)).toBe('user02@example.com');

      const updatedNamePromise: Promise<string | undefined> = firstValueFrom(name$.pipe(skip(1), take(1)));

      const updatedDisplayNamePromise: Promise<string | undefined> = firstValueFrom(
        displayName$.pipe(skip(1), take(1))
      );
      const updatedEmailAddressPromise: Promise<string | undefined> = firstValueFrom(
        emailAddress$.pipe(skip(1), take(1))
      );

      env.requesterDataById.get('user02')!.name = 'Changed User Name';
      env.requesterDataById.get('user02')!.displayName = 'Changed User';
      env.requesterDataById.get('user02')!.email = 'changed@example.com';
      env.requesterChangesById.get('user02')!.next();

      expect(await updatedNamePromise).toBe('Changed User Name');
      expect(await updatedDisplayNamePromise).toBe('Changed User');
      expect(await updatedEmailAddressPromise).toBe('changed@example.com');
    });
  });

  describe('export', () => {
    it('exports tsv rows through DraftJobsExportService', () => {
      const env = new TestEnvironment();
      const range: NormalizedDateRange = {
        start: new Date('2024-01-01T00:00:00Z'),
        end: new Date('2024-01-31T23:59:59Z')
      };
      env.component['dateRange$'].next(range);
      env.component['rows'] = [
        env.createRow({
          projectId: 'proj-a',
          servalCreated: new Date('2024-01-01T00:00:00Z'),
          requesterId: 'user-1',
          trainingBooks: env.createProjectBooks('proj-a', ['GEN']),
          translationBooks: env.createProjectBooks('proj-a', ['MAT'])
        })
      ];

      // SUT
      env.component['exportTsv']();

      verify(mockExportService.exportTsv(anything(), anything(), anything(), anything(), anything())).once();
    });
  });

  describe('problems', () => {
    const headingSFErrors: string = 'SF errors';
    const headingSFWarnings: string = 'SF warnings';
    const headingServalErrors: string = 'Serval errors';
    const headingServalWarnings: string = 'Serval warnings';

    const msgSFError: string = 'SF error';
    const msgSFWarning: string = 'SF warning';
    const msgSFWarning2: string = 'SF warning 2';
    const msgFaulted: string = 'Faulted: Engine crashed';
    const msgMissingData: string = 'Missing data';
    const msgServalWarning: string = 'Serval warning';
    const msgMessage1: string = 'Message 1';
    const msgMessage2: string = 'Message 2';

    it('hasAnyProblems returns false when no problems are present', () => {
      const env = new TestEnvironment();
      const row: ServalBuildRow = env.createRow({ problems: [] });

      expect(env.component.hasAnyProblems(row)).toBeFalse();
    });

    it('hasAnyProblems returns true when at least one problem is present', () => {
      const env = new TestEnvironment();
      const row: ServalBuildRow = env.createRow({
        problems: [{ source: 'serval', severity: 'error', message: msgFaulted }]
      });

      expect(env.component.hasAnyProblems(row)).toBeTrue();
    });

    it('problems filters by origin and severity', () => {
      const env = new TestEnvironment();
      const problems: BuildReportProblem[] = [
        { source: 'local', severity: 'error', message: msgSFError },
        { source: 'local', severity: 'warning', message: msgSFWarning2 },
        { source: 'local', severity: 'warning', message: msgSFWarning },
        { source: 'serval', severity: 'error', message: msgFaulted },
        { source: 'serval', severity: 'error', message: msgFaulted },
        { source: 'serval', severity: 'error', message: msgFaulted },
        { source: 'serval', severity: 'warning', message: msgMissingData },
        { source: 'serval', severity: 'warning', message: msgServalWarning },
        { source: 'serval', severity: 'warning', message: msgServalWarning },
        { source: 'serval', severity: 'warning', message: msgServalWarning }
      ];
      const row: ServalBuildRow = env.createRow({ problems });

      expect(env.component.problems(row, 'local', 'error').length).toBe(1);
      expect(env.component.problems(row, 'local', 'warning').length).toBe(2);
      expect(env.component.problems(row, 'serval', 'error').length).toBe(3);
      expect(env.component.problems(row, 'serval', 'warning').length).toBe(4);
    });

    it('problemsBadgeTooltip joins all problem messages', () => {
      const env = new TestEnvironment();
      const problems: BuildReportProblem[] = [
        { source: 'local', severity: 'error', message: msgSFError },
        { source: 'serval', severity: 'warning', message: msgServalWarning }
      ];
      const row: ServalBuildRow = env.createRow({ problems });

      const tooltip: string = env.component.problemsBadgeTooltip(row);

      expect(tooltip).toBe(`${msgSFError}. ${msgServalWarning}`);
    });

    it('problemSections keeps full untruncated problem text', () => {
      const env = new TestEnvironment();
      const fullMessage = 'This is a very long Serval warning message that must not be truncated in the dialog.';
      const problems: BuildReportProblem[] = [
        { source: 'local', severity: 'error', message: msgSFError },
        { source: 'serval', severity: 'warning', message: fullMessage }
      ];
      const row: ServalBuildRow = env.createRow({ problems });

      const sections: { heading: string; problems: BuildReportProblem[] }[] = env.component.problemSections(row);

      expect(sections[0].heading).toBe(headingSFErrors);
      expect(sections[0].problems[0].message).toBe(msgSFError);
      expect(sections[1].heading).toBe(headingSFWarnings);
      // There are no SF warnings.
      expect(sections[1].problems.length).toBe(0);
      expect(sections[2].heading).toBe(headingServalErrors);
      // There are no Serval errors.
      expect(sections[2].problems.length).toBe(0);
      expect(sections[3].heading).toBe(headingServalWarnings);
      expect(sections[3].problems[0].message).toBe(fullMessage);
    });

    it('renderProblemMessagesForCard limits returned amount of problems', () => {
      const env = new TestEnvironment();
      const problems: BuildReportProblem[] = [
        { source: 'serval', severity: 'warning', message: 'Message 1' },
        { source: 'serval', severity: 'warning', message: 'Message 2' },
        { source: 'serval', severity: 'warning', message: 'Message 3' },
        { source: 'serval', severity: 'warning', message: 'Message 4' },
        { source: 'serval', severity: 'warning', message: 'Message 5' },
        { source: 'serval', severity: 'warning', message: 'Message 6' },
        { source: 'serval', severity: 'warning', message: 'Message 7' },
        { source: 'serval', severity: 'warning', message: 'Message 8' },
        { source: 'serval', severity: 'warning', message: 'Message 9' },
        { source: 'serval', severity: 'warning', message: 'Message 10' },
        { source: 'serval', severity: 'warning', message: 'Message 11' },
        { source: 'serval', severity: 'warning', message: 'Message 12' }
      ];

      const preview: string[] = env.component.renderProblemMessagesForCard(problems);
      const limit: number = env.component.problemPreviewLimit;
      const ellipsisItem: number = 1;
      expect(preview.length).toBe(limit + ellipsisItem);
      expect(preview[limit]).toEqual('…');
    });

    it('renderProblemMessagesForCard returns all messages when not too many', () => {
      const env = new TestEnvironment();
      const problems: BuildReportProblem[] = [
        { source: 'local', severity: 'error', message: msgMessage1 },
        { source: 'local', severity: 'error', message: msgMessage2 }
      ];

      const preview: string[] = env.component.renderProblemMessagesForCard(problems);
      expect(preview.length).toBe(2);
      expect(preview).toEqual([msgMessage1, msgMessage2]);
    });

    it('showAllProblems opens serval build problems dialog', () => {
      const env = new TestEnvironment();
      let componentArg: any;
      let configArg: any;
      when(mockDialogService.openMatDialog(anything(), anything())).thenCall((component: any, config: any) => {
        componentArg = component;
        configArg = config;
        return undefined as never;
      });
      const problems: BuildReportProblem[] = [
        { source: 'local', severity: 'warning', message: msgSFWarning },
        { source: 'serval', severity: 'error', message: msgFaulted }
      ];
      const row: ServalBuildRow = env.createRow({ problems });

      env.component.showAllProblems(row);

      verify(mockDialogService.openMatDialog(anything(), anything())).once();
      expect(componentArg).toBe(ServalBuildProblemsDialog);
      expect(configArg.data.sections.length).toBe(4);
      expect(configArg.data.sections[0].heading).toBe(headingSFErrors);
      expect(configArg.data.sections[1].heading).toBe(headingSFWarnings);
      expect(configArg.data.sections[2].heading).toBe(headingServalErrors);
      expect(configArg.data.sections[3].heading).toBe(headingServalWarnings);
    });
  });
});

/** Provides helpers for constructing test data for ServalBuildsComponent tests. */
class TestEnvironment {
  readonly component: ServalBuildsComponent;
  readonly fixture: ComponentFixture<ServalBuildsComponent>;
  private rowIndex: number = 0;
  readonly requesterDataById: Map<string, RequesterInfo> = new Map<string, RequesterInfo>();
  readonly requesterChangesById: Map<string, Subject<void>> = new Map<string, Subject<void>>();
  readonly builds$: BehaviorSubject<ServalBuildReportDto[] | undefined> = new BehaviorSubject<
    ServalBuildReportDto[] | undefined
  >(undefined);
  readonly queryParams$: BehaviorSubject<Record<string, unknown>> = new BehaviorSubject<Record<string, unknown>>({});

  constructor() {
    this.setRequesterData('user02', { name: 'Test User Name', displayName: 'Test User', email: 'user02@example.com' });

    when(mockNoticeService.loadingStarted(anything())).thenReturn(undefined);
    when(mockNoticeService.loadingFinished(anything())).thenReturn(undefined);
    when(mockDraftGenerationService.getBuildsSince(anything())).thenReturn(this.builds$);
    when(mockDialogService.openMatDialog(anything(), anything())).thenReturn(undefined as never);
    when(mockDialogService.openGenericDialog(anything())).thenReturn({
      dialogRef: undefined as never,
      result: Promise.resolve(undefined)
    } as never);
    when(mockExportService.exportCsv(anything(), anything(), anything(), anything(), anything())).thenReturn(undefined);
    when(mockExportService.exportRsv(anything(), anything(), anything(), anything(), anything())).thenReturn(undefined);
    when(mockExportService.exportTsv(anything(), anything(), anything(), anything(), anything())).thenReturn(undefined);
    when(mockUserService.get(anything())).thenCall((requesterSFUserId: string) => {
      const userData: RequesterInfo | undefined = this.requesterDataById.get(requesterSFUserId);
      const changes$: Subject<void> | undefined = this.requesterChangesById.get(requesterSFUserId);
      const userDoc = {
        data: userData,
        changes$: changes$
      } as unknown as UserDoc;
      return Promise.resolve(userDoc);
    });
    when(mockI18nService.localeCode).thenReturn('en');
    when(mockI18nService.getLanguageDisplayName(anything())).thenReturn(undefined);
    when(mockedActivatedRoute.queryParams).thenReturn(this.queryParams$);

    this.fixture = TestBed.createComponent(ServalBuildsComponent);
    this.component = this.fixture.componentInstance;
  }

  /** Adequate wait for rows to update in response to any changes in filtering/searching. */
  waitForRowUpdate(): void {
    flush();
  }

  setRequesterData(requesterSFUserId: string, userData: RequesterInfo): void {
    const defaultUserData: RequesterInfo = {
      name: `${requesterSFUserId} Name`,
      displayName: `${requesterSFUserId} Display`,
      email: `${requesterSFUserId}@example.com`
    };
    this.requesterDataById.set(requesterSFUserId, { ...defaultUserData, ...userData });
    this.requesterChangesById.set(requesterSFUserId, new Subject<void>());
  }

  /** Creates a default BuildReportTimeline with optional overrides. */
  static makeTimeline(overrides: Partial<BuildReportTimeline> = {}): BuildReportTimeline {
    const result = {
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
    return result;
  }

  /** Creates a default ServalBuildReportDto with optional timeline overrides. */
  makeReport(timelineOverrides: Partial<BuildReportTimeline> = {}): ServalBuildReportDto {
    const result = {
      build: undefined,
      project: undefined,
      timeline: TestEnvironment.makeTimeline(timelineOverrides),
      config: {
        trainingScriptureRanges: [],
        translationScriptureRanges: [],
        trainingDataFileIds: []
      },
      problems: [],
      draftGenerationRequestId: undefined,
      requesterSFUserId: undefined,
      status: DraftGenerationBuildStatus.Completed
    };
    return result;
  }

  /** This helper attempts to allow both (1) creating a populated data row with minimal specification, and (2) creating
   *  a data row with specific missing data fields. Unspecified data will have a default set. If data should be missing,
   *  specify null. */
  createRow({
    projectId = `sf-project-${++this.rowIndex}`,
    ptProjectId = `pt-project-${this.rowIndex}`,
    projectShortName = `PRJ${this.rowIndex}`,
    projectName = `Project Name ${this.rowIndex}`,
    sfUserRequested = new Date(Date.UTC(2024, 0, 1 + this.rowIndex, 0, 0, 0, 0)),
    // servalCreated is at minute 2 since the SF build request could be at minute 1 if included here.
    servalCreated = notNull(sfUserRequested) ? this.addMinutes(sfUserRequested, 2) : null,
    servalFinished = notNull(servalCreated) ? this.addMinutes(servalCreated, 1) : null,
    sfAcknowledgedCompletion = notNull(servalFinished) ? this.addMinutes(servalFinished, 1) : null,
    requesterId = `user-${this.rowIndex}`,
    servalBuildId = `build-${this.rowIndex}`,
    draftGenerationRequestId = `draft-request-${this.rowIndex}`,
    trainingBooks = [],
    translationBooks = [],
    status = DraftGenerationBuildStatus.Completed,
    problems = [],
    projectDeleted = false,
    hasServalBuild = true,
    hasEvents = true
  }: {
    projectId?: string | null;
    ptProjectId?: string;
    projectShortName?: string;
    projectName?: string;
    sfUserRequested?: Date | null;
    servalCreated?: Date | null;
    servalFinished?: Date | null;
    sfAcknowledgedCompletion?: Date | null;
    requesterId?: string | null;
    servalBuildId?: string;
    draftGenerationRequestId?: string | null;
    trainingBooks?: ProjectBooks[];
    translationBooks?: ProjectBooks[];
    status?: DraftGenerationBuildStatus;
    problems?: BuildReportProblem[];
    projectDeleted?: boolean;
    /** Whether or not there is a Serval build that this row is based on. Records that correspond to no Serval build
     * aren't able to have certain kinds of data. */
    hasServalBuild?: boolean;
    /** Whether or not there are any events from which this row is based on. Records that correspond to no events
     * aren't able to have certain kinds of data. */
    hasEvents?: boolean;
  }): ServalBuildRow {
    if (!hasEvents) {
      // Check data consistency here rather than expect each caller to not make a mistake.
      if (
        sfUserRequested != null ||
        sfAcknowledgedCompletion != null ||
        draftGenerationRequestId != null ||
        requesterId != null ||
        trainingBooks.length > 0 ||
        translationBooks.length > 0
      ) {
        throw Error(`test setup error: hasEvents is false but event-derived data is set.`);
      }
    }

    if (!hasServalBuild && (servalCreated != null || servalFinished != null)) {
      throw Error('test setup error: hasServalBuild is false but a Serval-derived time is set.');
    }

    const computedDurationMs: number | undefined =
      servalCreated != null && servalFinished != null ? servalFinished.getTime() - servalCreated.getTime() : undefined;

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
            buildId: servalBuildId,
            step: 0,
            trainingScriptureRanges: [],
            translationEngineId: 'translation-engine-id',
            translationScriptureRanges: [],
            trainingDataFileIds: [],
            canDenormalizeQuotes: true,
            requestedByUserId: requesterId ?? undefined
          }
        }
      : undefined;

    const report: ServalBuildReportDto = {
      build: servalBuild,
      project:
        projectId != null
          ? { sfProjectId: projectId, ptProjectId: ptProjectId, shortName: projectShortName, name: projectName }
          : undefined,
      timeline: TestEnvironment.makeTimeline({
        servalCreated: servalCreated ?? undefined,
        servalFinished: servalFinished ?? undefined,
        sfUserRequested: sfUserRequested ?? undefined,
        sfAcknowledgedCompletion: sfAcknowledgedCompletion ?? undefined,
        requestTime: sfUserRequested ?? servalCreated ?? undefined
      }),
      config: {
        trainingScriptureRanges: [],
        translationScriptureRanges: [],
        trainingDataFileIds: []
      },
      problems: problems,
      draftGenerationRequestId: draftGenerationRequestId ?? undefined,
      requesterSFUserId: requesterId ?? undefined,
      status: status
    };

    const result: ServalBuildRow = {
      report: report,
      trainingBooks: trainingBooks,
      translationBooks: translationBooks,
      projectNameDisplay: buildProjectDisplayName(projectShortName, projectName, projectId ?? undefined),
      durationMs: computedDurationMs,
      projectServalAdminUrl: undefined,
      projectDeleted: projectDeleted
    };
    return result;
  }

  createProjectBooks(projectId: string, books: string[], projectDisplayName?: string): ProjectBooks[] {
    const displayName: string = projectDisplayName ?? projectId.toUpperCase();
    return [
      { sfProjectId: projectId, projectDisplayName: displayName, booksAndChapters: books.map(b => ({ bookId: b })) }
    ];
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
      timeline: TestEnvironment.makeTimeline({
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
      status: DraftGenerationBuildStatus.Completed
    };
  }

  addHours(date: Date, hours: number): Date {
    const millisecondsPerHour: number = 1000 * 60 * 60;
    const startMs: number = date.getTime();
    return new Date(startMs + hours * millisecondsPerHour);
  }

  addMinutes(date: Date, minutes: number): Date {
    const millisecondsPerMinute: number = 1000 * 60;
    const startMs: number = date.getTime();
    return new Date(startMs + minutes * millisecondsPerMinute);
  }
}
