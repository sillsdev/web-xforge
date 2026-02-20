import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { DebugElement } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed } from '@angular/core/testing';
import { provideNativeDateAdapter } from '@angular/material/core';
import { By } from '@angular/platform-browser';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { anything, capture, mock, resetCalls, verify, when } from 'ts-mockito';
import { AuthService } from 'xforge-common/auth.service';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nService } from 'xforge-common/i18n.service';
import { Locale } from 'xforge-common/models/i18n-locale';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { provideTestOnlineStatus } from 'xforge-common/test-online-status-providers';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { provideTestRealtime } from 'xforge-common/test-realtime-providers';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, getTestTranslocoModule } from 'xforge-common/test-utils';
import { SF_TYPE_REGISTRY } from '../core/models/sf-type-registry';
import { SFProjectService } from '../core/sf-project.service';
import { EventMetric, EventScope } from '../event-metrics/event-metric';
import { DraftJob, DraftJobsComponent, DraftJobsTableRow, DraftJobStatus } from './draft-jobs.component';
import { JobDetailsDialogComponent } from './job-details-dialog.component';
import sampleEvents from './sample-events.json';
import { ServalAdministrationService } from './serval-administration.service';

const mockedActivatedRoute = mock(ActivatedRoute);
const mockedAuthService = mock(AuthService);
const mockedDialogService = mock(DialogService);
const mockedI18nService = mock(I18nService);
const mockedProjectService = mock(SFProjectService);
const mockedServalAdministrationService = mock(ServalAdministrationService);

describe('DraftJobsComponent', () => {
  configureTestingModule(() => ({
    imports: [getTestTranslocoModule(), DraftJobsComponent],
    providers: [
      provideTestOnlineStatus(),
      provideTestRealtime(SF_TYPE_REGISTRY),
      provideHttpClient(withInterceptorsFromDi()),
      provideHttpClientTesting(),
      provideRouter([]),
      provideNoopAnimations(),
      provideNativeDateAdapter(),
      { provide: ActivatedRoute, useMock: mockedActivatedRoute },
      { provide: AuthService, useMock: mockedAuthService },
      { provide: DialogService, useMock: mockedDialogService },
      { provide: I18nService, useMock: mockedI18nService },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService },
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: ServalAdministrationService, useMock: mockedServalAdministrationService }
    ]
  }));

  it('should show jobs from event metrics', fakeAsync(() => {
    const env = new TestEnvironment();
    env.wait();
    expect(env.component.rows.length).toBeGreaterThan(0);
    expect(env.rows.length).toBeGreaterThan(0);
    expect(env.emptyMessage).toBeNull();
  }));

  it('should display empty state when no jobs', fakeAsync(() => {
    const env = new TestEnvironment({ hasEvents: false });
    env.wait();
    expect(env.rows.length).toBe(0);
    expect(env.emptyMessage).not.toBeNull();
    expect(env.emptyMessage!.nativeElement.textContent).toContain('No draft jobs found');
  }));

  it('should reload data when date range changes', fakeAsync(() => {
    const env = new TestEnvironment();
    env.wait();
    const start = new Date('2025-10-01');
    const end = new Date('2025-10-15');
    env.setDateRange(start, end);
    env.wait();
    // Verify that data was reloaded (the component should have jobs after the date range change)
    expect(env.component.rows.length).toBeGreaterThan(0);
  }));

  describe('associates events into jobs', () => {
    it('successful jobs', fakeAsync(() => {
      const env = new TestEnvironment();
      env.wait();
      // The Serval build id and event metric ids are written here from looking at the sample data.
      const servalBuildId = 'serval-build-1';

      const draftJob: DraftJob = env.component.rows.filter(row => row.job.buildId === servalBuildId)[0].job;
      // Confirm test setup.
      expect(draftJob.status).toEqual('success');

      expect(draftJob!.startEvent!.id).toEqual('event-metric-05');
      expect(draftJob!.buildEvent!.id).toEqual('event-metric-04');
      expect(draftJob!.cancelEvent).toBeUndefined();
      expect(draftJob!.finishEvent!.id).toEqual('event-metric-01');
    }));

    it('cancelled jobs', fakeAsync(() => {
      const env = new TestEnvironment();
      env.wait();
      const servalBuildId = 'serval-build-2';

      const draftJob: DraftJob = env.component.rows.filter(row => row.job.buildId === servalBuildId)[0].job;
      // Confirm test setup.
      expect(draftJob.status).toEqual('cancelled');

      expect(draftJob!.startEvent!.id).toEqual('event-metric-14');
      expect(draftJob!.buildEvent!.id).toEqual('event-metric-13');
      expect(draftJob!.cancelEvent!.id).toEqual('event-metric-12');
      expect(draftJob!.finishEvent!.id).toEqual('event-metric-11');
    }));

    it('faulted jobs', fakeAsync(() => {
      const env = new TestEnvironment();
      env.wait();
      const servalBuildId = 'serval-build-4';

      const draftJob: DraftJob = env.component.rows.filter(row => row.job.buildId === servalBuildId)[0].job;
      // Confirm test setup.
      expect(draftJob.status).toEqual('failed');

      expect(draftJob!.startEvent!.id).toEqual('event-metric-17');
      expect(draftJob!.buildEvent!.id).toEqual('event-metric-16');
      expect(draftJob!.cancelEvent).toBeUndefined();
      expect(draftJob!.finishEvent!.id).toEqual('event-metric-15');
    }));

    it('in-progress jobs', fakeAsync(() => {
      // This Serval job had StartPreTranslationBuildAsync and BuildProjectAsync but nothing more yet.
      const env = new TestEnvironment();
      env.wait();
      const servalBuildId = 'serval-build-5';

      const draftJob: DraftJob = env.component.rows.filter(row => row.job.buildId === servalBuildId)[0].job;
      // Confirm test setup.
      expect(draftJob.status).toEqual('running');

      expect(draftJob!.startEvent!.id).toEqual('event-metric-07');
      expect(draftJob!.buildEvent!.id).toEqual('event-metric-06');
      expect(draftJob!.cancelEvent).toBeUndefined();
      expect(draftJob!.finishEvent).toBeUndefined();
    }));

    it('treats retrieve status events with matching build id as finishing events', fakeAsync(() => {
      const env = new TestEnvironment({ hasEvents: false });
      env.wait();
      const start = env.createEvent('start-req', 'StartPreTranslationBuildAsync', {
        timeStamp: '2025-01-01T00:00:00.000Z'
      });
      const build = env.createEvent('build-req', 'BuildProjectAsync', {
        timeStamp: '2025-01-01T00:01:00.000Z',
        result: 'build-req'
      });
      const retrieve = env.createEvent('retrieve-req', 'RetrievePreTranslationStatusAsync', {
        timeStamp: '2025-01-01T00:04:00.000Z',
        result: 'build-req'
      });

      const jobs: DraftJob[] = DraftJobsComponent['buildDraftJobs']([start, build, retrieve], 'requestId');

      expect(jobs.length).toBe(1);
      const job = jobs[0];
      expect(job.finishEvent?.id).toBe('retrieve-req');
      expect(job.status).toBe('success');
      expect(job.duration).toBe(4 * 60 * 1000);
    }));

    it('ignores retrieve status events when build id does not match', fakeAsync(() => {
      const env = new TestEnvironment({ hasEvents: false });
      env.wait();
      const start = env.createEvent('start-req', 'StartPreTranslationBuildAsync', {
        timeStamp: '2025-01-01T00:00:00.000Z'
      });
      const build = env.createEvent('build-req', 'BuildProjectAsync', {
        timeStamp: '2025-01-01T00:01:00.000Z',
        result: 'build-req'
      });
      const retrieve = env.createEvent('retrieve-req', 'RetrievePreTranslationStatusAsync', {
        timeStamp: '2025-01-01T00:04:00.000Z',
        result: 'some-other-build'
      });

      const jobs: DraftJob[] = DraftJobsComponent['buildDraftJobs']([start, build, retrieve], 'requestId');

      expect(jobs.length).toBe(1);
      const job = jobs[0];
      expect(job.finishEvent).toBeUndefined();
      expect(job.status).toBe('running');
    }));

    it('uses the earliest of multiple retrieve status events', fakeAsync(() => {
      // Suppose something causes us to generate multiple RetrievePreTranslationStatusAsync events. Use the one that is
      // earliest in time.
      const env = new TestEnvironment({ hasEvents: false });
      env.wait();
      const start = env.createEvent('start-req', 'StartPreTranslationBuildAsync', {
        timeStamp: '2025-01-01T00:00:00.000Z'
      });
      const build = env.createEvent('build-req', 'BuildProjectAsync', {
        timeStamp: '2025-01-01T00:01:00.000Z',
        result: 'build-req'
      });
      const retrieveA = env.createEvent('retrieve-reqA', 'RetrievePreTranslationStatusAsync', {
        timeStamp: '2025-01-01T00:04:02.000Z',
        result: 'build-req'
      });
      // B has the earliest timestamp.
      const retrieveB = env.createEvent('retrieve-reqB', 'RetrievePreTranslationStatusAsync', {
        timeStamp: '2025-01-01T00:04:01.000Z',
        result: 'build-req'
      });
      const retrieveC = env.createEvent('retrieve-reqC', 'RetrievePreTranslationStatusAsync', {
        timeStamp: '2025-01-01T00:04:03.000Z',
        result: 'build-req'
      });

      const jobs: DraftJob[] = DraftJobsComponent['buildDraftJobs'](
        [start, build, retrieveA, retrieveB, retrieveC],
        'requestId'
      );

      expect(jobs.length).toBe(1);
      const job = jobs[0];
      expect(job.finishEvent?.id).toBe('retrieve-reqB');
      expect(job.status).toBe('success');
      expect(job.duration).toBe(4 * 60 * 1000 + 1 * 1000);
    }));
  });

  describe('associates older events into jobs', () => {
    // Older events did not have a draftGenerationRequestId and used another association method. They are stored in the sample events file and have an `A` in the various Ids used.

    it('successful jobs', fakeAsync(() => {
      const env = new TestEnvironment();
      env.wait();
      // The Serval build id and event metric ids are written here from looking at the sample data.
      const servalBuildId = 'serval-build-A1';

      const draftJob: DraftJob = env.component.rows.filter(row => row.job.buildId === servalBuildId)[0].job;
      // Confirm test setup.
      expect(draftJob.status).toEqual('success');

      expect(draftJob!.startEvent!.id).toEqual('event-metric-A05');
      expect(draftJob!.buildEvent!.id).toEqual('event-metric-A04');
      expect(draftJob!.cancelEvent).toBeUndefined();
      // Notice that the prior event grouping can use ExecuteWebhookAsync for a finish event rather than BuildCompletedAsync.
      expect(draftJob!.finishEvent!.id).toEqual('event-metric-A03');
    }));

    it('cancelled jobs', fakeAsync(() => {
      const env = new TestEnvironment();
      env.wait();
      const servalBuildId = 'serval-build-A2';

      const draftJob: DraftJob = env.component.rows.filter(row => row.job.buildId === servalBuildId)[0].job;
      // Confirm test setup.
      expect(draftJob.status).toEqual('cancelled');

      expect(draftJob!.startEvent!.id).toEqual('event-metric-A14');
      expect(draftJob!.buildEvent!.id).toEqual('event-metric-A13');
      expect(draftJob!.cancelEvent!.id).toEqual('event-metric-A12');
      // Notice that the prior event grouping did not define a 'finishEvent' for cancelled jobs.
      expect(draftJob!.finishEvent).toBeUndefined();
    }));

    it('faulted jobs', fakeAsync(() => {
      const env = new TestEnvironment();
      env.wait();
      const servalBuildId = 'serval-build-A4';

      const draftJob: DraftJob = env.component.rows.filter(row => row.job.buildId === servalBuildId)[0].job;
      // Confirm test setup.
      expect(draftJob.status).toEqual('failed');

      expect(draftJob!.startEvent!.id).toEqual('event-metric-A17');
      expect(draftJob!.buildEvent!.id).toEqual('event-metric-A16');
      expect(draftJob!.cancelEvent).toBeUndefined();
      expect(draftJob!.finishEvent!.id).toEqual('event-metric-A15');
    }));

    it('in-progress jobs', fakeAsync(() => {
      // This Serval job had StartPreTranslationBuildAsync and BuildProjectAsync but nothing more yet.
      const env = new TestEnvironment();
      env.wait();
      const servalBuildId = 'serval-build-A5';

      const draftJob: DraftJob = env.component.rows.filter(row => row.job.buildId === servalBuildId)[0].job;
      // Confirm test setup.
      expect(draftJob.status).toEqual('running');

      expect(draftJob!.startEvent!.id).toEqual('event-metric-A07');
      expect(draftJob!.buildEvent!.id).toEqual('event-metric-A06');
      expect(draftJob!.cancelEvent).toBeUndefined();
      expect(draftJob!.finishEvent).toBeUndefined();
    }));
  });

  describe('job details dialog data', () => {
    it('includes draft generation request id in dialog data', fakeAsync(() => {
      const env = new TestEnvironment();
      env.wait();
      const jobRow = env.component.rows.find(
        row => row.job.draftGenerationRequestId != null && row.job.buildId != null
      );

      expect(jobRow).toBeDefined();
      if (jobRow == null) {
        return;
      }

      resetCalls(mockedDialogService);
      when(mockedDialogService.openMatDialog(anything(), anything())).thenReturn({} as any);

      env.component.openJobDetailsDialog(jobRow.job);

      verify(mockedDialogService.openMatDialog(anything(), anything())).once();
      const [component, config] = capture(mockedDialogService.openMatDialog as any).last();

      expect(component).toBe(JobDetailsDialogComponent);
      const dialogData: any = (config as any)?.data;
      expect(dialogData.draftGenerationRequestId).toEqual(jobRow.job.draftGenerationRequestId);
    }));
  });

  describe('event group validation', () => {
    it('throws when grouped events contain mismatched request ids', fakeAsync(() => {
      // Suppose the createJobFromRequestGroup method is called with a set of event metrics that do not have the same draftGenerationRequestId. Throw.

      const env = new TestEnvironment({ hasEvents: false });
      env.wait();
      const start = env.createEvent('start-1', 'StartPreTranslationBuildAsync');
      const build = env.createEvent('build-1', 'BuildProjectAsync', { timeStamp: '2025-01-01T00:01:00.000Z' });
      const finish = env.createEvent('finish-1', 'BuildCompletedAsync', {
        timeStamp: '2025-01-01T00:02:00.000Z',
        payload: { buildState: 'Completed', sfProjectId: 'sf-test-project', buildId: 'build-1' }
      });
      const mismatched = env.createEvent('mismatch-1', 'ExecuteWebhookAsync', {
        tags: { draftGenerationRequestId: 'req-2' },
        timeStamp: '2025-01-01T00:03:00.000Z'
      });

      expect(() =>
        DraftJobsComponent['createJobFromRequestGroup']('req-1', [start, build, finish, mismatched])
      ).toThrowError(/share/i);
    }));

    it('throws when grouped events contain multiple start events', fakeAsync(() => {
      const env = new TestEnvironment({ hasEvents: false });
      env.wait();
      const startOne = env.createEvent('start-1', 'StartPreTranslationBuildAsync');
      const startTwo = env.createEvent('start-2', 'StartPreTranslationBuildAsync', {
        timeStamp: '2025-01-01T00:00:30.000Z'
      });
      const build = env.createEvent('build-1', 'BuildProjectAsync', { timeStamp: '2025-01-01T00:01:00.000Z' });

      expect(() => DraftJobsComponent['createJobFromRequestGroup']('req-1', [startOne, startTwo, build])).toThrowError(
        /exactly one startpretranslationbuildasync/i
      );
    }));

    it('throws when grouped events are missing a start event', fakeAsync(() => {
      const env = new TestEnvironment({ hasEvents: false });
      env.wait();
      const build = env.createEvent('build-1', 'BuildProjectAsync', { timeStamp: '2025-01-01T00:01:00.000Z' });

      expect(() => DraftJobsComponent['createJobFromRequestGroup']('req-1', [build])).toThrowError(
        /exactly one startpretranslationbuildasync/i
      );
    }));

    it('throws when grouped events contain multiple build events', fakeAsync(() => {
      const env = new TestEnvironment({ hasEvents: false });
      env.wait();
      const start = env.createEvent('start-1', 'StartPreTranslationBuildAsync');
      const buildOne = env.createEvent('build-1', 'BuildProjectAsync', { timeStamp: '2025-01-01T00:01:00.000Z' });
      const buildTwo = env.createEvent('build-2', 'BuildProjectAsync', { timeStamp: '2025-01-01T00:01:30.000Z' });

      expect(() => DraftJobsComponent['createJobFromRequestGroup']('req-1', [start, buildOne, buildTwo])).toThrowError(
        /more than one buildprojectasync/i
      );
    }));

    it('throws when grouped events contain multiple build completed events', fakeAsync(() => {
      const env = new TestEnvironment({ hasEvents: false });
      env.wait();
      const start = env.createEvent('start-1', 'StartPreTranslationBuildAsync');
      const build = env.createEvent('build-1', 'BuildProjectAsync', { timeStamp: '2025-01-01T00:01:00.000Z' });
      const finishOne = env.createEvent('finish-1', 'BuildCompletedAsync', {
        timeStamp: '2025-01-01T00:02:00.000Z',
        payload: { buildState: 'Completed', sfProjectId: 'sf-test-project', buildId: 'build-1' }
      });
      const finishTwo = env.createEvent('finish-2', 'BuildCompletedAsync', {
        timeStamp: '2025-01-01T00:03:00.000Z',
        payload: { buildState: 'Completed', sfProjectId: 'sf-test-project', buildId: 'build-1' }
      });

      expect(() =>
        DraftJobsComponent['createJobFromRequestGroup']('req-1', [start, build, finishOne, finishTwo])
      ).toThrowError(/more than one buildcompletedasync/i);
    }));

    it('throws when there is a cancel event without a BuildCompleted cancel state', fakeAsync(() => {
      // When a cancel event happens, the current behavior is that the BuildCompletedAsync event also has a buildState of 'Canceled'. The createJobFromRequestGroup method will expect that.

      const env = new TestEnvironment({ hasEvents: false });
      env.wait();
      const start = env.createEvent('start-1', 'StartPreTranslationBuildAsync');
      const build = env.createEvent('build-1', 'BuildProjectAsync', { timeStamp: '2025-01-01T00:01:00.000Z' });
      const finish = env.createEvent('finish-1', 'BuildCompletedAsync', {
        timeStamp: '2025-01-01T00:02:00.000Z',
        payload: { buildState: 'Completed', sfProjectId: 'sf-test-project', buildId: 'build-1' }
      });
      const cancel = env.createEvent('cancel-1', 'CancelPreTranslationBuildAsync', {
        timeStamp: '2025-01-01T00:02:30.000Z'
      });

      expect(() =>
        DraftJobsComponent['createJobFromRequestGroup']('req-1', [start, build, finish, cancel])
      ).toThrowError(/Cancel/i);
    }));
  });

  describe('buildDraftJobs', () => {
    it('skips request groups missing a start event', fakeAsync(() => {
      // Suppose the user selects a date range such that the start date+time is after a draft generation starts and before it finishes. The list of event metrics will have events about the job being processed, but there will not be a start event. Omit those jobs from the data we present.
      //
      // If the end date falls after a start event and before a job's finish event, we'll just show that as in progress.

      const env = new TestEnvironment({ hasEvents: false });
      env.wait();

      const buildEvent = env.createEvent('build-1', 'BuildProjectAsync', {
        timeStamp: '2025-01-01T00:01:00.000Z',
        tags: { draftGenerationRequestId: 'req-1' },
        result: 'build-1'
      });

      const jobs: DraftJob[] = DraftJobsComponent['buildDraftJobs']([buildEvent], 'requestId');
      // There is no job for the event in the output.
      expect(jobs.length).toBe(0);
    }));
  });

  describe('grouping mode selection', () => {
    it('uses request grouping when toggle is set', fakeAsync(() => {
      const env = new TestEnvironment({ hasEvents: false, initialGrouping: 'timing' });
      env.wait();

      const start = env.createEvent('start-1', 'StartPreTranslationBuildAsync');
      const build = env.createEvent('build-1', 'BuildProjectAsync', {
        timeStamp: '2025-01-01T00:01:00.000Z',
        result: 'build-1'
      });
      const finish = env.createEvent('finish-1', 'BuildCompletedAsync', {
        timeStamp: '2025-01-01T00:02:00.000Z',
        payload: { buildState: 'Completed', sfProjectId: 'sf-test-project', buildId: 'build-1' }
      });

      env.component['draftEvents'] = [start, build, finish];
      const requestSpy = spyOn(DraftJobsComponent as any, 'createJobFromRequestGroup').and.callThrough();
      const timingSpy = spyOn(DraftJobsComponent as any, 'createJobsUsingLegacyCorrelation').and.callThrough();

      env.component.onGroupingModeChange('requestId');

      expect(env.component.groupingMode).toBe('requestId');
      expect(requestSpy).toHaveBeenCalledTimes(1);
      expect(timingSpy).not.toHaveBeenCalled();
    }));

    it('uses timing grouping when toggle is set', fakeAsync(() => {
      const env = new TestEnvironment({ hasEvents: false });
      env.wait();

      const start = env.createEvent('start-1', 'StartPreTranslationBuildAsync');
      const build = env.createEvent('build-1', 'BuildProjectAsync', {
        timeStamp: '2025-01-01T00:01:00.000Z',
        result: 'build-1'
      });
      const finish = env.createEvent('finish-1', 'BuildCompletedAsync', {
        timeStamp: '2025-01-01T00:02:00.000Z',
        payload: { buildState: 'Completed', sfProjectId: 'sf-test-project', buildId: 'build-1' }
      });

      env.component['draftEvents'] = [start, build, finish];
      const requestSpy = spyOn(DraftJobsComponent as any, 'createJobFromRequestGroup').and.callThrough();
      const timingSpy = spyOn(DraftJobsComponent as any, 'createJobsUsingLegacyCorrelation').and.callThrough();

      env.component.onGroupingModeChange('timing');

      expect(env.component.groupingMode).toBe('timing');
      expect(timingSpy).toHaveBeenCalledTimes(1);
      expect(requestSpy).not.toHaveBeenCalled();
    }));
  });

  describe('duration statistics', () => {
    describe('meanDuration', () => {
      it('should return undefined when rows is empty', fakeAsync(() => {
        const env = new TestEnvironment({ hasEvents: false });
        env.wait();

        expect(env.component.meanDuration).toBeUndefined();
      }));

      it('should return undefined when all jobs have no duration', fakeAsync(() => {
        const env = new TestEnvironment({ hasEvents: false });
        env.wait();
        env.component.rows = [env.createRowWithDuration(undefined), env.createRowWithDuration(undefined)];

        expect(env.component.meanDuration).toBeUndefined();
      }));

      it('should calculate mean for single job', fakeAsync(() => {
        const env = new TestEnvironment({ hasEvents: false });
        env.wait();
        env.component.rows = [env.createRowWithDuration(3600000)]; // 1 hour

        expect(env.component.rows.length).toBe(1);
        expect(env.component.rows[0].job.duration).toBe(3600000);
        expect(env.component.meanDuration).toBe(3600000);
      }));

      it('should calculate mean for multiple jobs', fakeAsync(() => {
        const env = new TestEnvironment({ hasEvents: false });
        env.wait();
        env.component.rows = [
          env.createRowWithDuration(3600000), // 1 hour
          env.createRowWithDuration(7200000), // 2 hours
          env.createRowWithDuration(1800000) // 30 minutes
        ];

        // Mean: (3600000 + 7200000 + 1800000) / 3 = 4200000
        expect(env.component.meanDuration).toBe(4200000);
      }));

      it('should ignore jobs with undefined duration when calculating mean', fakeAsync(() => {
        const env = new TestEnvironment({ hasEvents: false });
        env.wait();
        env.component.rows = [
          env.createRowWithDuration(3600000), // 1 hour
          env.createRowWithDuration(undefined), // incomplete job
          env.createRowWithDuration(7200000) // 2 hours
        ];

        // Mean: (3600000 + 7200000) / 2 = 5400000
        expect(env.component.meanDuration).toBe(5400000);
      }));

      it('should ignore non-successful jobs when calculating mean', fakeAsync(() => {
        const env = new TestEnvironment({ hasEvents: false });
        env.wait();
        env.component.rows = [
          env.createRowWithDuration(3600000, 'success'), // counts
          env.createRowWithDuration(5400000, 'running'), // excluded because not success
          env.createRowWithDuration(7200000, 'failed') // excluded because not success
        ];

        // Mean: only the successful job's duration should be counted
        expect(env.component.meanDuration).toBe(3600000);
      }));
    });

    describe('maxDuration', () => {
      it('should return undefined when rows is empty', fakeAsync(() => {
        const env = new TestEnvironment({ hasEvents: false });
        env.wait();

        expect(env.component.maxDuration).toBeUndefined();
      }));

      it('should return undefined when all jobs have no duration', fakeAsync(() => {
        const env = new TestEnvironment({ hasEvents: false });
        env.wait();
        env.component.rows = [env.createRowWithDuration(undefined), env.createRowWithDuration(undefined)];

        expect(env.component.maxDuration).toBeUndefined();
      }));

      it('should return duration for single job', fakeAsync(() => {
        const env = new TestEnvironment({ hasEvents: false });
        env.wait();
        env.component.rows = [env.createRowWithDuration(3600000)]; // 1 hour

        expect(env.component.maxDuration).toBe(3600000);
      }));

      it('should find max duration from multiple jobs', fakeAsync(() => {
        const env = new TestEnvironment({ hasEvents: false });
        env.wait();
        env.component.rows = [
          env.createRowWithDuration(3600000), // 1 hour
          env.createRowWithDuration(7200000), // 2 hours (max)
          env.createRowWithDuration(1800000) // 30 minutes
        ];

        expect(env.component.maxDuration).toBe(7200000);
      }));

      it('should ignore jobs with undefined duration when finding max', fakeAsync(() => {
        const env = new TestEnvironment({ hasEvents: false });
        env.wait();
        env.component.rows = [
          env.createRowWithDuration(3600000), // 1 hour
          env.createRowWithDuration(undefined), // incomplete job
          env.createRowWithDuration(7200000) // 2 hours (max)
        ];

        expect(env.component.maxDuration).toBe(7200000);
      }));
    });

    describe('meanDurationFormatted', () => {
      it('should return undefined when mean is undefined', fakeAsync(() => {
        const env = new TestEnvironment({ hasEvents: false });
        env.wait();

        expect(env.component.meanDurationFormatted).toBeUndefined();
      }));

      it('should format mean duration', fakeAsync(() => {
        const env = new TestEnvironment({ hasEvents: false });
        env.wait();
        env.component.rows = [
          env.createRowWithDuration(3661000) // 1h 1m 1s ≈ 1.0 hours
        ];

        expect(env.component.meanDurationFormatted).toBe('1.0 h');
      }));
    });

    describe('maxDurationFormatted', () => {
      it('should return undefined when max is undefined', fakeAsync(() => {
        const env = new TestEnvironment({ hasEvents: false });
        env.wait();

        expect(env.component.maxDurationFormatted).toBeUndefined();
      }));

      it('should format max duration', fakeAsync(() => {
        const env = new TestEnvironment({ hasEvents: false });
        env.wait();
        env.component.rows = [
          env.createRowWithDuration(7261000) // 2h 1m 1s ≈ 2.0 hours
        ];

        expect(env.component.maxDurationFormatted).toBe('2.0 h');
      }));
    });

    describe('shouldShowDurationComparisonCaution', () => {
      it('should return false if no date range is set', fakeAsync(() => {
        const env = new TestEnvironment({ hasEvents: false });
        env.wait();
        env.component['currentDateRange'] = undefined;

        // SUT
        expect(env.component.shouldShowDurationComparisonCaution).toBeFalse();
      }));

      it('should return true when the date range starts before the cutoff', fakeAsync(() => {
        const env = new TestEnvironment({ hasEvents: false });
        env.wait();
        env.setDateRange(new Date(2025, 12 - 1, 1), new Date(2026, 1 - 1, 20));

        // SUT
        expect(env.component.shouldShowDurationComparisonCaution).toBeTrue();
      }));

      it('should return false when the date range starts on or after the cutoff', fakeAsync(() => {
        const env = new TestEnvironment({ hasEvents: false });
        env.wait();
        env.setDateRange(new Date(2026, 1 - 1, 20), new Date(2026, 2 - 1, 20));

        // SUT
        expect(env.component.shouldShowDurationComparisonCaution).toBeFalse();
      }));
    });

    describe('formatDurationInHours', () => {
      it('should format duration in decimal hours', fakeAsync(() => {
        const env = new TestEnvironment({ hasEvents: false });
        env.wait();

        expect(env.component['formatDurationInHours'](3600000)).toBe('1.0 h'); // 1 hour
        expect(env.component['formatDurationInHours'](7200000)).toBe('2.0 h'); // 2 hours
        expect(env.component['formatDurationInHours'](5400000)).toBe('1.5 h'); // 1.5 hours
      }));

      it('should format with 1 decimal place precision', fakeAsync(() => {
        const env = new TestEnvironment({ hasEvents: false });
        env.wait();

        expect(env.component['formatDurationInHours'](1800000)).toBe('0.5 h'); // 30 minutes
        expect(env.component['formatDurationInHours'](900000)).toBe('0.3 h'); // 15 minutes (0.25 rounds to 0.3)
        expect(env.component['formatDurationInHours'](3661000)).toBe('1.0 h'); // 1h 1m 1s (rounds to 1.0)
        expect(env.component['formatDurationInHours'](5461000)).toBe('1.5 h'); // 1h 31m 1s (rounds to 1.5)
      }));

      it('should handle zero duration', fakeAsync(() => {
        const env = new TestEnvironment({ hasEvents: false });
        env.wait();

        expect(env.component['formatDurationInHours'](0)).toBe('0.0 h');
      }));

      it('should handle large durations', fakeAsync(() => {
        const env = new TestEnvironment({ hasEvents: false });
        env.wait();

        // 24 hours
        expect(env.component['formatDurationInHours'](86400000)).toBe('24.0 h');
        // 48.5 hours
        expect(env.component['formatDurationInHours'](174600000)).toBe('48.5 h');
      }));
    });
  });
});

class TestEnvironment {
  readonly component: DraftJobsComponent;
  readonly fixture: ComponentFixture<DraftJobsComponent>;
  readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);
  readonly testOnlineStatusService: TestOnlineStatusService = TestBed.inject(
    OnlineStatusService
  ) as TestOnlineStatusService;
  readonly localeSubject: BehaviorSubject<Locale>;
  private readonly queryParams$ = new BehaviorSubject<any>({});

  constructor({
    hasEvents = true,
    initialGrouping = 'requestId'
  }: {
    hasEvents?: boolean;
    initialGrouping?: 'requestId' | 'timing';
  } = {}) {
    const initialLocale: Locale = {
      canonicalTag: 'en',
      direction: 'ltr',
      englishName: 'English',
      localName: 'English',
      production: true,
      tags: ['en']
    };

    this.localeSubject = new BehaviorSubject<Locale>(initialLocale);

    when(mockedI18nService.locale$).thenReturn(this.localeSubject.asObservable());
    when(mockedI18nService.formatDate(anything(), anything())).thenCall(
      (date: Date, _options?: { showTimeZone?: boolean }) => date.toISOString()
    );

    when(mockedActivatedRoute.queryParams).thenReturn(this.queryParams$.asObservable());
    when(mockedAuthService.currentUserRoles).thenReturn([]);
    if (hasEvents) this.setupDraftJobsData();
    this.fixture = TestBed.createComponent(DraftJobsComponent);
    this.component = this.fixture.componentInstance;
    this.fixture.detectChanges();
    // The component will default to 'timing' at present. But tests should default to 'requestId' unless 'timing' is
    // requested.
    this.setGroupingMode(initialGrouping);
  }

  setDateRange(start: Date, end: Date): void {
    const normalizedRange = {
      start: new Date(start.getFullYear(), start.getMonth(), start.getDate()),
      end: new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999)
    };
    this.component.onDateRangeChange(normalizedRange);
    this.fixture.detectChanges();
  }

  get table(): DebugElement | null {
    return this.fixture.debugElement.query(By.css('#draft-jobs-table'));
  }

  get rows(): DebugElement[] {
    if (!this.table) return [];
    return this.table.queryAll(By.css('.job-row'));
  }

  get emptyMessage(): DebugElement | null {
    return this.fixture.debugElement.query(By.css('#no-draft-jobs-found-message'));
  }

  wait(): void {
    flush();
    this.fixture.detectChanges();
  }

  setGroupingMode(mode: 'requestId' | 'timing'): void {
    this.component.onGroupingModeChange(mode);
  }

  createRowWithDuration(duration: number | undefined, statusOverride?: DraftJobStatus): DraftJobsTableRow {
    const jobStatus: DraftJobStatus = statusOverride ?? (duration != null ? 'success' : 'running');
    return {
      job: {
        buildId: 'build-123',
        projectId: 'project1',
        status: jobStatus,
        startTime: new Date('2025-01-15T10:00:00Z'),
        finishTime: duration != null ? new Date('2025-01-15T11:00:00Z') : undefined,
        duration: duration,
        events: [],
        additionalEvents: [],
        userId: 'user123',
        trainingBooks: [],
        translationBooks: []
      },
      projectId: 'project1',
      projectName: 'Test Project',
      projectDeleted: false,
      startTimeStamp: '2025-01-15 10:00 UTC',
      duration: duration != null ? '1h 0m 0s' : undefined,
      status: this.component['getStatusDisplay'](jobStatus),
      userId: 'user123',
      trainingBooks: [],
      translationBooks: []
    };
  }

  setupDraftJobsData(): void {
    const eventMetrics: EventMetric[] = this.transformJsonToEventMetrics(sampleEvents);

    when(
      mockedProjectService.onlineAllEventMetricsForConstructingDraftJobs(anything(), anything(), anything(), anything())
    ).thenCall((eventTypes: string[], projectId?: string, _startDate?: Date, _endDate?: Date) => {
      let events: EventMetric[] = eventMetrics.filter(event => eventTypes.includes(event.eventType));
      if (projectId != null) events = events.filter(event => event.projectId === projectId);
      return { results: events, unpagedCount: events.length };
    });

    // Mock project names via ServalAdministrationService for projects in JSON
    const projectIds = [...new Set(eventMetrics.map(e => e.projectId).filter((id): id is string => id != null))];
    projectIds.forEach(projectId => {
      when(mockedServalAdministrationService.get(projectId)).thenResolve({
        id: projectId,
        data: { name: `Project ${projectId.substring(0, 8)}`, shortName: projectId.substring(0, 4) }
      } as any);
    });
  }

  createEvent(id: string, eventType: string, overrides: Partial<EventMetric> = {}): EventMetric {
    const event: EventMetric = {
      id,
      eventType,
      timeStamp: '2025-01-01T00:00:00.000Z',
      scope: EventScope.Drafting,
      payload: {},
      userId: 'user-1',
      projectId: 'sf-test-project',
      result: undefined,
      executionTime: undefined,
      exception: undefined,
      tags: { draftGenerationRequestId: 'req-1' }
    };

    if (overrides.timeStamp != null) event.timeStamp = overrides.timeStamp;
    if (overrides.scope != null) event.scope = overrides.scope;
    if (overrides.payload != null) event.payload = overrides.payload;
    if (overrides.userId !== undefined) event.userId = overrides.userId;
    if (overrides.projectId !== undefined) event.projectId = overrides.projectId;
    if (overrides.result !== undefined) event.result = overrides.result;
    if (overrides.executionTime !== undefined) event.executionTime = overrides.executionTime;
    if (overrides.exception !== undefined) event.exception = overrides.exception;
    if (overrides.tags != null) event.tags = overrides.tags;

    return event;
  }

  /**
   * Transforms JSON event data to EventMetric objects.
   * Transforms "timeStamp":{"$date":"foo"} to just "timeStamp".
   */
  private transformJsonToEventMetrics(jsonData: any[]): EventMetric[] {
    return jsonData.map(event => ({
      id: event._id,
      eventType: event.eventType,
      timeStamp: typeof event.timeStamp === 'string' ? event.timeStamp : (event.timeStamp?.$date ?? ''),
      scope: event.scope as EventScope,
      payload: event.payload ?? {},
      userId: event.userId,
      projectId: event.projectId,
      result: event.result,
      executionTime: event.executionTime,
      exception: event.exception,
      tags: event.tags
    }));
  }
}
