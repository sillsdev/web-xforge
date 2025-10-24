import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { DebugElement } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { anything, mock, verify, when } from 'ts-mockito';
import { AuthService } from 'xforge-common/auth.service';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nService } from 'xforge-common/i18n.service';
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
    imports: [
      getTestTranslocoModule(),
      provideTestOnlineStatus(),
      provideTestRealtime(SF_TYPE_REGISTRY),
      DraftJobsComponent
    ],
    providers: [
      provideHttpClient(withInterceptorsFromDi()),
      provideHttpClientTesting(),
      provideRouter([]),
      provideNoopAnimations(),
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

  it('should reload data when time period changes', fakeAsync(() => {
    const env = new TestEnvironment();
    env.wait();
    env.component.daysBack = 14;
    env.wait();
    verify(mockedProjectService.onlineAllEventMetricsForConstructingDraftJobs(anything(), anything(), 14)).once();
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

  class TestEnvironment {
    readonly component: DraftJobsComponent;
    readonly fixture: ComponentFixture<DraftJobsComponent>;
    readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);
    readonly testOnlineStatusService: TestOnlineStatusService = TestBed.inject(
      OnlineStatusService
    ) as TestOnlineStatusService;
    private readonly queryParams$ = new BehaviorSubject<any>({});

    constructor({ hasEvents = true }: { hasEvents?: boolean } = {}) {
      when(mockedActivatedRoute.queryParams).thenReturn(this.queryParams$.asObservable());
      when(mockedAuthService.currentUserRoles).thenReturn([]);
      when(mockedI18nService.formatDate(anything(), anything())).thenCall((date: Date) => date.toISOString());
      if (hasEvents) this.setupDraftJobsData();
      this.fixture = TestBed.createComponent(DraftJobsComponent);
      this.component = this.fixture.componentInstance;
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

    setupDraftJobsData(): void {
      const eventMetrics: EventMetric[] = this.transformJsonToEventMetrics(sampleEvents);

      when(
        mockedProjectService.onlineAllEventMetricsForConstructingDraftJobs(anything(), anything(), anything())
      ).thenCall((eventTypes: string[], projectId?: string, _daysBack?: number) => {
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
});
