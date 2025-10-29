import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { DebugElement } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed } from '@angular/core/testing';
import { provideNativeDateAdapter } from '@angular/material/core';
import { By } from '@angular/platform-browser';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { anything, mock, when } from 'ts-mockito';
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
import { DraftJob, DraftJobsComponent } from './draft-jobs.component';
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
      expect(draftJob!.finishEvent!.id).toEqual('event-metric-03');
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
      expect(draftJob!.finishEvent).toBeUndefined();
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

  constructor({ hasEvents = true }: { hasEvents?: boolean } = {}) {
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

  createRowWithDuration(duration: number | undefined): any {
    return {
      job: {
        buildId: 'build-123',
        projectId: 'project1',
        status: duration != null ? 'success' : 'running',
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
      status: duration != null ? 'Success' : 'Running',
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
      exception: event.exception
    }));
  }
}
