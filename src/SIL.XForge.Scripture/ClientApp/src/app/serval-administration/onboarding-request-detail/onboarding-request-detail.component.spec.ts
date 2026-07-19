import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { DebugElement } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { anything, deepEqual, instance, mock, verify, when } from 'ts-mockito';
import { DialogService } from 'xforge-common/dialog.service';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { provideTestOnlineStatus } from 'xforge-common/test-online-status-providers';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { configureTestingModule, getTestTranslocoModule } from 'xforge-common/test-utils';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SFProjectService } from '../../core/sf-project.service';
import {
  OnboardingRequest,
  OnboardingRequestResolutionKey,
  OnboardingRequestService
} from '../../translate/draft-generation/onboarding-request.service';
import { OnboardingRequestDetailComponent } from '../onboarding-request-detail/onboarding-request-detail.component';
import { ServalAdministrationService } from '../serval-administration.service';
import { ApproveRequestDialogResult } from './approve-request-dialog/approve-request-dialog.component';

const mockedActivatedRoute = mock(ActivatedRoute);
const mockedDialogService = mock(DialogService);
const mockedNoticeService = mock(NoticeService);
const mockedOnboardingRequestService = mock(OnboardingRequestService);
const mockedServalAdministrationService = mock(ServalAdministrationService);
const mockedUserService = mock(UserService);
const mockedProjectService = mock(SFProjectService);

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
        partnerOrganization: 'none',
        translationLanguageName: 'English',
        translationLanguageIsoCode: 'en',
        completedBooks: [40, 41, 42, 43],
        nextBooksToDraft: [44],
        sourceProjectA: 'training_source_pt',
        draftingSourceProject: 'drafting_source_pt',
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
      { provide: UserService, useMock: mockedUserService },
      { provide: SFProjectService, useMock: mockedProjectService }
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

  describe('approveRequest', () => {
    const MAIN_PARATEXT_ID = 'paratext01';
    const BT_PARATEXT_ID = 'bt_paratext01';
    const BT_SF_PROJECT_ID = 'bt_sf_project01';

    function createProjectDoc(sfProjectId: string, paratextId: string, shortName: string): SFProjectProfileDoc {
      return {
        id: sfProjectId,
        data: {
          paratextId,
          shortName,
          name: `${shortName} Name`,
          writingSystem: { tag: 'en' },
          translateConfig: { preTranslate: false },
          sync: { lastSyncSuccessful: true }
        }
      } as unknown as SFProjectProfileDoc;
    }

    const mainProjectDoc = createProjectDoc('project01', MAIN_PARATEXT_ID, 'MAIN');

    it('returns early without calling services when dialog is cancelled', fakeAsync(() => {
      const env = new TestEnvironment({
        mainProjectDoc,
        approveDialogResult: null
      });
      env.wait();

      void env.component.approveRequest();
      flush();

      verify(mockedProjectService.onlineSetDraftSources(anything(), anything(), anything())).never();
      verify(mockedOnboardingRequestService.approveRequest(anything())).never();
      expect().nothing();
    }));

    it('configures drafting sources and approves the request when the dialog is confirmed', fakeAsync(() => {
      const approvedRequest = createTestRequest({ resolution: 'approved' });
      when(mockedOnboardingRequestService.approveRequest(anything())).thenResolve(approvedRequest);
      const env = new TestEnvironment({
        mainProjectDoc,
        approveDialogResult: {
          draftingSourceParatextId: 'drafting_source_pt',
          trainingSourceParatextIds: ['training_source_pt'],
          enableBackTranslationDrafting: false
        }
      });
      env.wait();

      void env.component.approveRequest();
      flush();

      verify(
        mockedProjectService.onlineSetDraftSources(
          'project01',
          deepEqual(['drafting_source_pt']),
          deepEqual(['training_source_pt'])
        )
      ).once();
      verify(
        mockedOnboardingRequestService.approveRequest(deepEqual({ requestId: REQUEST_ID, sfProjectId: 'project01' }))
      ).once();
      expect(env.component.request?.resolution).toBe('approved');
    }));

    it('enables back translation drafting when enableBackTranslationDrafting is true', fakeAsync(() => {
      when(mockedOnboardingRequestService.approveRequest(anything())).thenResolve(createTestRequest());
      const defaultSubmission = createTestRequest().submission;
      const env = new TestEnvironment({
        mainProjectDoc,
        request: {
          submission: {
            ...defaultSubmission,
            formData: { ...defaultSubmission.formData, backTranslationProject: BT_PARATEXT_ID }
          }
        },
        projectDocsByParatextId: new Map([[BT_PARATEXT_ID, createProjectDoc(BT_SF_PROJECT_ID, BT_PARATEXT_ID, 'BT')]]),
        approveDialogResult: {
          draftingSourceParatextId: 'drafting_source_pt',
          trainingSourceParatextIds: ['training_source_pt'],
          enableBackTranslationDrafting: true
        }
      });
      env.wait();

      void env.component.approveRequest();
      flush();

      verify(
        mockedProjectService.onlineSetDraftSources(
          'project01',
          deepEqual(['drafting_source_pt']),
          deepEqual(['training_source_pt'])
        )
      ).once();
      verify(
        mockedProjectService.onlineSetDraftSources(
          BT_SF_PROJECT_ID,
          deepEqual([MAIN_PARATEXT_ID]),
          deepEqual([MAIN_PARATEXT_ID])
        )
      ).once();
      verify(mockedProjectService.onlineSetPreTranslate(BT_SF_PROJECT_ID, true)).once();
      verify(mockedOnboardingRequestService.approveRequest(anything())).once();
      expect().nothing();
    }));
  });

  /**
   * Test environment for OnboardingRequestDetailComponent tests.
   * Sets up the component with mock services and a default request.
   */
  class TestEnvironment {
    readonly component: OnboardingRequestDetailComponent;
    readonly fixture: ComponentFixture<OnboardingRequestDetailComponent>;
    private readonly approveDialogRef = mock(MatDialogRef);

    constructor(
      options: {
        request?: Partial<OnboardingRequest>;
        mainProjectDoc?: SFProjectProfileDoc;
        projectDocsByParatextId?: Map<string, SFProjectProfileDoc>;
        /** Pass a result to simulate dialog confirmation, or null to simulate cancellation. */
        approveDialogResult?: ApproveRequestDialogResult | null;
      } = {}
    ) {
      const request = createTestRequest(options.request);

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
      when(mockedServalAdministrationService.getByParatextId(anything(), anything())).thenResolve(undefined);
      // Specific paratextId overrides must be registered after the anything() stub so they take priority
      for (const [paratextId, doc] of options.projectDocsByParatextId ?? []) {
        when(mockedServalAdministrationService.getByParatextId(paratextId, anything())).thenResolve(doc);
      }
      if (options.mainProjectDoc != null) {
        when(mockedServalAdministrationService.subscribe(request.submission.projectId, anything())).thenResolve(
          options.mainProjectDoc
        );
      }
      if ('approveDialogResult' in options) {
        when(this.approveDialogRef.afterClosed()).thenReturn(of(options.approveDialogResult));
        when(mockedDialogService.openMatDialog(anything(), anything())).thenReturn(
          instance(this.approveDialogRef) as any
        );
        when(mockedProjectService.onlineSetDraftSources(anything(), anything(), anything())).thenResolve();
        when(mockedProjectService.onlineSetPreTranslate(anything(), anything())).thenResolve();
      }

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
