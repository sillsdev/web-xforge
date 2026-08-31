import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { saveAs } from 'file-saver';
import { BehaviorSubject, Observable } from 'rxjs';
import { anything, deepEqual, mock, verify, when } from 'ts-mockito';
import { NoticeService } from 'xforge-common/notice.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { UserService } from 'xforge-common/user.service';
import {
  OnboardingRequestResolutionKey,
  OnboardingRequestService,
  OnboardingRequestSummary
} from '../../translate/draft-generation/onboarding-request.service';
import { ServalAdministrationService } from '../serval-administration.service';
import { OnboardingRequestsExportService } from './onboarding-requests-export.service';
import { OnboardingRequestsComponent } from './onboarding-requests.component';

const mockedUserService = mock(UserService);
const mockedNoticeService = mock(NoticeService);
const mockedServalAdministrationService = mock(ServalAdministrationService);
const mockedOnboardingRequestService = mock(OnboardingRequestService);
const mockedExportService = mock(OnboardingRequestsExportService);
const activatedRouteQueryParams$ = new BehaviorSubject<Record<string, string>>({});
const mockedActivatedRoute = {
  queryParams: activatedRouteQueryParams$.asObservable()
};

describe('OnboardingRequestsComponent', () => {
  configureTestingModule(() => ({
    imports: [OnboardingRequestsComponent],
    providers: [
      provideRouter([]),
      { provide: UserService, useMock: mockedUserService },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: ServalAdministrationService, useMock: mockedServalAdministrationService },
      { provide: OnboardingRequestService, useMock: mockedOnboardingRequestService },
      { provide: OnboardingRequestsExportService, useMock: mockedExportService },
      { provide: ActivatedRoute, useValue: mockedActivatedRoute },
      { provide: OnboardingRequestsExportService, useMock: mockedExportService }
    ]
  }));

  describe('date range control', () => {
    it('should include requests within the selected date range', () => {
      const env = new TestEnvironment();
      env.component.activeFilter = 'all';
      env.component.requests = [
        createTestRequest('req-before', '2026-01-09T23:59:59.000Z'),
        createTestRequest('req-start', '2026-01-10T00:00:00.000Z'),
        createTestRequest('req-middle', '2026-01-15T12:34:56.000Z'),
        createTestRequest('req-end', '2026-01-20T23:59:59.999Z'),
        createTestRequest('req-after', '2026-01-21T00:00:00.000Z')
      ];

      env.component.onDateFilterChange({
        start: new Date('2026-01-10T00:00:00.000Z'),
        end: new Date('2026-01-20T23:59:59.999Z')
      });

      expect(env.component.filteredRequests.map(r => r.id)).toEqual(['req-start', 'req-middle', 'req-end']);
    });

    it('should return all requests when no date range has been selected', () => {
      const env = new TestEnvironment();
      env.component.activeFilter = 'all';
      env.component.requests = [
        createTestRequest('req-1', '2026-01-05T10:00:00.000Z'),
        createTestRequest('req-2', '2026-02-10T10:00:00.000Z')
      ];

      env.component.filterRequests();

      expect(env.component.filteredRequests.map(r => r.id)).toEqual(['req-1', 'req-2']);
    });

    it('should exclude requests with invalid submission timestamps when date filtering', () => {
      const env = new TestEnvironment();
      env.component.activeFilter = 'all';
      env.component.requests = [
        createTestRequest('req-valid', '2026-03-01T12:00:00.000Z'),
        createTestRequest('req-invalid', 'not-a-date')
      ];

      env.component.onDateFilterChange({
        start: new Date('2026-03-01T00:00:00.000Z'),
        end: new Date('2026-03-01T23:59:59.999Z')
      });

      expect(env.component.filteredRequests.map(r => r.id)).toEqual(['req-valid']);
    });
  });

  describe('search field control', () => {
    it('should filter requests by search text', () => {
      const env = new TestEnvironment();
      env.component.activeFilter = 'all';
      env.component.requests = [
        createTestRequest('req-1', '2026-01-05T10:00:00.000Z', {
          name: 'Alice',
          email: 'alice@example.com',
          languageCode: 'eng'
        }),
        createTestRequest('req-2', '2026-01-05T11:00:00.000Z', {
          name: 'Bob',
          email: 'bob@example.com',
          languageCode: 'spa'
        })
      ];

      env.component.searchControl.setValue('bob');

      expect(env.component.filteredRequests.map(r => r.id)).toEqual(['req-2']);
    });

    it('should update and clear the q query param when search changes', () => {
      const env = new TestEnvironment();
      const navigateSpy = spyOn(env.component['router'], 'navigate').and.resolveTo(true);

      env.component.searchControl.setValue('eng');
      expect(navigateSpy).toHaveBeenCalledWith([], jasmine.objectContaining({ queryParams: { q: 'eng' } }));

      env.component.clearSearch();
      expect(navigateSpy).toHaveBeenCalledWith([], jasmine.objectContaining({ queryParams: { q: null } }));
    });

    it('should read q from query params and apply filtering', () => {
      const env = new TestEnvironment();
      env.component.activeFilter = 'all';
      env.component.requests = [
        createTestRequest('req-1', '2026-01-05T10:00:00.000Z'),
        createTestRequest('req-2', '2026-01-05T11:00:00.000Z')
      ];
      env.component.projectNames.set('project01', 'French Project');
      env.component.projectNames.set('project02', 'Spanish Project');
      env.component.requests[1].submission.projectId = 'project02';

      env.component.ngOnInit();
      env.queryParams$.next({ q: 'spanish' });

      expect(env.component.searchControl.value).toBe('spanish');
      expect(env.component.filteredRequests.map(r => r.id)).toEqual(['req-2']);
    });
  });

  describe('download buttons', () => {
    it('should export only filtered rows for CSV', async () => {
      const env = new TestEnvironment();
      const req1 = createTestRequest('req-1', '2026-01-05T10:00:00.000Z');
      const req2 = createTestRequest('req-2', '2026-01-05T11:00:00.000Z');
      env.component.requests = [req1, req2];
      env.component.filteredRequests = [req2];

      await env.component.exportCsv();

      verify(mockedExportService.createCsv(deepEqual([req2]))).once();
      expect().nothing();
    });

    it('should export only filtered rows for TSV', async () => {
      const env = new TestEnvironment();
      const req1 = createTestRequest('req-1', '2026-01-05T10:00:00.000Z');
      const req2 = createTestRequest('req-2', '2026-01-05T11:00:00.000Z');
      env.component.requests = [req1, req2];
      env.component.filteredRequests = [req1];

      await env.component.exportTsv();

      verify(mockedExportService.createTsv(deepEqual([req1]))).once();
      expect().nothing();
    });
  });
});

class TestEnvironment {
  readonly fixture: ComponentFixture<OnboardingRequestsComponent>;
  readonly component: OnboardingRequestsComponent;
  readonly queryParams$: BehaviorSubject<Record<string, string>>;
  readonly route: { queryParams: Observable<Record<string, string>> };

  constructor(args: { requests?: OnboardingRequestSummary[] } = {}) {
    activatedRouteQueryParams$.next({});
    this.queryParams$ = activatedRouteQueryParams$;

    when(mockedUserService.currentUserId).thenReturn('user01');
    when(mockedNoticeService.loadingStarted).thenReturn(() => {});
    when(mockedNoticeService.show(anything())).thenResolve();
    when(mockedServalAdministrationService.get(anything())).thenResolve(undefined as any);
    when(mockedOnboardingRequestService.getAllRequests()).thenResolve(args.requests ?? []);
    when(mockedOnboardingRequestService.getCurrentlyAssignedUserIds()).thenResolve([]);
    when(mockedExportService.createCsv(anything())).thenResolve('csv-content');
    when(mockedExportService.createTsv(anything())).thenResolve('tsv-content');
    when(mockedExportService.exportFilename(anything())).thenReturn('onboarding-requests.csv');
    spyOn(saveAs, 'saveAs').and.stub();

    this.route = mockedActivatedRoute;

    this.fixture = TestBed.createComponent(OnboardingRequestsComponent);
    this.component = this.fixture.componentInstance;
    this.fixture.detectChanges();
  }
}

function createTestRequest(
  id: string,
  timestamp: string,
  overrides: { name?: string; email?: string; languageCode?: string } = {}
): OnboardingRequestSummary {
  return {
    id,
    submission: {
      projectId: 'project01',
      userId: 'user03',
      timestamp,
      formData: {
        name: overrides.name ?? 'Requester',
        email: overrides.email ?? 'requester@example.com',
        translationLanguageName: 'English',
        translationLanguageIsoCode: overrides.languageCode ?? 'en'
      }
    },
    assigneeId: '',
    status: 'new',
    resolution: 'unresolved' as OnboardingRequestResolutionKey
  };
}
