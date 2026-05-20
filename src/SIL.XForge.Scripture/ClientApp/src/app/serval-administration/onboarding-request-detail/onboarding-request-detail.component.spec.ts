import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { DebugElement } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { anything, mock, verify, when } from 'ts-mockito';
import { DialogService } from 'xforge-common/dialog.service';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { provideTestOnlineStatus } from 'xforge-common/test-online-status-providers';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { configureTestingModule, getTestTranslocoModule } from 'xforge-common/test-utils';
import { UserService } from 'xforge-common/user.service';
import {
  OnboardingRequest,
  OnboardingRequestResolutionKey,
  OnboardingRequestService
} from '../../translate/draft-generation/onboarding-request.service';
import { OnboardingRequestDetailComponent } from '../onboarding-request-detail/onboarding-request-detail.component';
import { ServalAdministrationService } from '../serval-administration.service';

const mockedActivatedRoute = mock(ActivatedRoute);
const mockedDialogService = mock(DialogService);
const mockedNoticeService = mock(NoticeService);
const mockedOnboardingRequestService = mock(OnboardingRequestService);
const mockedServalAdministrationService = mock(ServalAdministrationService);
const mockedUserService = mock(UserService);

const REQUEST_ID = 'request01';
const CURRENT_USER_ID = 'user01';

/** Creates a minimal OnboardingRequest for use in tests. */
function createTestRequest(overrides: Partial<OnboardingRequest> = {}): OnboardingRequest {
  return {
    id: REQUEST_ID,
    submittedAt: '2024-01-01T00:00:00Z',
    submittedBy: { name: 'Test User', email: 'test@example.com' },
    submission: {
      projectId: 'project01',
      userId: 'user03',
      timestamp: '2024-01-01T00:00:00Z',
      formData: {
        name: 'Test User',
        email: 'test@example.com',
        organization: 'Test Org',
        partnerOrganization: 'Partner Org',
        translationLanguageName: 'English',
        translationLanguageIsoCode: 'en',
        completedBooks: [40, 41, 42, 43],
        nextBooksToDraft: [44],
        sourceProjectA: 'ptproject01',
        draftingSourceProject: 'ptproject02',
        backTranslationStage: 'None',
        backTranslationProject: null
      }
    },
    assigneeId: '',
    status: 'new',
    resolution: 'unresolved',
    comments: [],
    ...overrides
  };
}

describe('OnboardingRequestDetailComponent', () => {
  configureTestingModule(() => ({
    imports: [OnboardingRequestDetailComponent, getTestTranslocoModule()],
    providers: [
      provideTestOnlineStatus(),
      provideHttpClient(withInterceptorsFromDi()),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: ActivatedRoute, useMock: mockedActivatedRoute },
      { provide: DialogService, useMock: mockedDialogService },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService },
      { provide: OnboardingRequestService, useMock: mockedOnboardingRequestService },
      { provide: ServalAdministrationService, useMock: mockedServalAdministrationService },
      { provide: UserService, useMock: mockedUserService }
    ]
  }));

  describe('assignee select', () => {
    it('should call onAssigneeChange when assignee is changed', fakeAsync(() => {
      const env = new TestEnvironment();
      env.wait();
      const updatedRequest = createTestRequest({ assigneeId: CURRENT_USER_ID, status: 'in_progress' });
      when(mockedOnboardingRequestService.setAssignee(REQUEST_ID, CURRENT_USER_ID)).thenResolve(updatedRequest);

      // SUT
      env.component.onAssigneeChange(CURRENT_USER_ID);
      flush();

      verify(mockedOnboardingRequestService.setAssignee(REQUEST_ID, CURRENT_USER_ID)).once();
      expect().nothing();
    }));

    it('should update local request after assignee change', fakeAsync(() => {
      const env = new TestEnvironment();
      env.wait();
      const updatedRequest = createTestRequest({ assigneeId: CURRENT_USER_ID, status: 'in_progress' });
      when(mockedOnboardingRequestService.setAssignee(REQUEST_ID, CURRENT_USER_ID)).thenResolve(updatedRequest);

      // SUT
      env.component.onAssigneeChange(CURRENT_USER_ID);
      flush();

      expect(env.component.request?.assigneeId).toBe(CURRENT_USER_ID);
      expect(env.component.request?.status).toBe('in_progress');
    }));
  });

  describe('resolution select', () => {
    it('should call onResolutionChange when resolution is changed', fakeAsync(() => {
      const env = new TestEnvironment();
      env.wait();
      const newResolution: OnboardingRequestResolutionKey = 'approved';
      const updatedRequest = createTestRequest({ resolution: newResolution });
      when(mockedOnboardingRequestService.setResolution(REQUEST_ID, newResolution)).thenResolve(updatedRequest);

      // SUT
      env.component.onResolutionChange(newResolution);
      flush();

      verify(mockedOnboardingRequestService.setResolution(REQUEST_ID, newResolution)).once();
      expect().nothing();
    }));

    it('should update local request after resolution change', fakeAsync(() => {
      const env = new TestEnvironment();
      env.wait();
      const newResolution: OnboardingRequestResolutionKey = 'declined';
      const updatedRequest = createTestRequest({ resolution: newResolution, assigneeId: '' });
      when(mockedOnboardingRequestService.setResolution(REQUEST_ID, newResolution)).thenResolve(updatedRequest);

      // SUT
      env.component.onResolutionChange(newResolution);
      flush();

      expect(env.component.request?.resolution).toBe(newResolution);
    }));
  });

  /**
   * Test environment for OnboardingRequestDetailComponent tests.
   * Sets up the component with mock services and a default request.
   */
  class TestEnvironment {
    readonly component: OnboardingRequestDetailComponent;
    readonly fixture: ComponentFixture<OnboardingRequestDetailComponent>;

    constructor() {
      const request = createTestRequest();

      when(mockedActivatedRoute.snapshot).thenReturn({
        paramMap: { get: (key: string) => (key === 'id' ? REQUEST_ID : null) }
      } as any);
      when(mockedUserService.currentUserId).thenReturn(CURRENT_USER_ID);
      when(mockedOnboardingRequestService.getRequestById(REQUEST_ID)).thenResolve(request);
      when(mockedOnboardingRequestService.getStatus(anything())).thenCall(
        status => ({ value: status, label: status, icon: 'help', color: 'gray' }) as any
      );
      when(mockedOnboardingRequestService.getCurrentlyAssignedUserIds()).thenResolve([
        CURRENT_USER_ID,
        'user02',
        'user03'
      ]);
      when(mockedServalAdministrationService.getByParatextId(anything())).thenResolve(undefined);

      this.fixture = TestBed.createComponent(OnboardingRequestDetailComponent);
      this.component = this.fixture.componentInstance;
      this.fixture.detectChanges();
    }

    get assigneeSelect(): DebugElement {
      return this.fixture.debugElement.query(By.css('app-onboarding-request-assignee-select'));
    }

    get resolutionSelect(): DebugElement {
      return this.fixture.debugElement.query(By.css('.resolution-field mat-select'));
    }

    wait(): void {
      tick();
      this.fixture.detectChanges();
      tick();
      this.fixture.detectChanges();
    }
  }
});
