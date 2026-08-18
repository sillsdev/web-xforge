import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { anything, mock, when } from 'ts-mockito';
import { NoticeService } from 'xforge-common/notice.service';
import { configureTestingModule, getTestTranslocoModule } from 'xforge-common/test-utils';
import { UserService } from 'xforge-common/user.service';
import { provideTestRealtime } from '../../../xforge-common/test-realtime-providers';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import {
  OnboardingRequest,
  OnboardingRequestService
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

fdescribe('OnboardingRequestsComponent', () => {
  configureTestingModule(() => ({
    imports: [OnboardingRequestsComponent, getTestTranslocoModule()],
    providers: [
      provideRouter([]),
      provideTestRealtime(SF_TYPE_REGISTRY),
      { provide: ActivatedRoute, useValue: mockedActivatedRoute },
      { provide: UserService, useMock: mockedUserService },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: ServalAdministrationService, useMock: mockedServalAdministrationService },
      { provide: OnboardingRequestService, useMock: mockedOnboardingRequestService },
      { provide: OnboardingRequestsExportService, useMock: mockedExportService }
    ]
  }));

  it('shows onboarding requests with default filter function', fakeAsync(() => {
    const env = new TestEnvironment();
    env.wait();
    // 2 new requests, 1 completed request
    expect(env.component.requests.length).toBe(3);
    expect(env.component.filteredRequests.length).toBe(2);
  }));

  it('can filter requests', fakeAsync(() => {
    const env = new TestEnvironment();
    env.wait();
    expect(env.component.filteredRequests.length).toBe(2);

    env.component.searchControl.setValue('User01');
    env.wait();
    expect(env.component.filteredRequests.length).toBe(1);
  }));

  it('can filter request by date range', fakeAsync(() => {
    const env = new TestEnvironment();
    env.wait();
    expect(env.component.filteredRequests.length).toBe(2);

    env.component.onDateFilterChange({
      start: new Date('2026-01-02T00:00:00.000Z'),
      end: new Date('2026-01-03T00:00:00.000Z')
    });
    env.wait();
    expect(env.component.filteredRequests.length).toBe(0);
  }));
});

class TestEnvironment {
  fixture: ComponentFixture<OnboardingRequestsComponent>;
  component: OnboardingRequestsComponent;

  constructor() {
    activatedRouteQueryParams$.next({});
    when(mockedUserService.currentUserId).thenReturn('assignee01');
    when(mockedNoticeService.loadingStarted).thenReturn(() => {});
    when(mockedNoticeService.loadingFinished).thenReturn(() => {});
    when(mockedNoticeService.show(anything())).thenResolve();
    when(mockedServalAdministrationService.get(anything())).thenResolve(undefined as any);
    when(mockedOnboardingRequestService.getCurrentlyAssignedUserIds()).thenResolve([]);
    when(mockedOnboardingRequestService.getStatus(anything())).thenReturn({ value: 'new', label: 'New' });

    this.setupRequests();
    this.fixture = TestBed.createComponent(OnboardingRequestsComponent);
    this.component = this.fixture.componentInstance;
    this.wait();
  }

  setupRequests(): void {
    const requests: OnboardingRequest[] = [
      this.getOnboardingRequest({ username: 'User01', status: 'new' }),
      this.getOnboardingRequest({ username: 'User02', status: 'new' }),
      this.getOnboardingRequest({ username: 'User03', status: 'completed' })
    ];
    when(mockedOnboardingRequestService.getAllRequests()).thenResolve(requests);
  }

  wait(): void {
    tick();
    this.fixture.detectChanges();
  }

  private getOnboardingRequest({
    username,
    status
  }: {
    username: string;
    status: 'new' | 'in_progress' | 'completed';
  }): OnboardingRequest {
    return {
      id: username + '-request',
      submittedAt: '2026-01-01T00:00:00Z',
      submittedBy: { name: username, email: username + '@example.com' },
      submission: {
        projectId: 'project01',
        userId: username + 'id',
        timestamp: '2026-01-01T00:00:00Z',
        formData: {
          name: 'Project 01',
          email: username + '@example.com',
          organization: 'Test Organization',
          partnerOrganization: 'none',
          translationLanguageName: 'English',
          translationLanguageIsoCode: 'en',
          completedBooks: [1, 2, 3],
          nextBooksToDraft: [4, 5, 6],
          sourceProjectA: 'sourceProjectA',
          draftingSourceProject: 'sourceProjectA',
          backTranslationStage: 'none',
          backTranslationProject: null
        }
      },
      assigneeId: 'assignee01',
      status: status,
      resolution: 'unresolved',
      comments: []
    };
  }
}
