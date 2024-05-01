import { HttpErrorResponse } from '@angular/common/http';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { BehaviorSubject, throwError } from 'rxjs';
import { anything, mock, verify, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { SFProjectProfileDoc } from '../core/models/sf-project-profile-doc';
import { SF_TYPE_REGISTRY } from '../core/models/sf-type-registry';
import { SFProjectService } from '../core/sf-project.service';
import { ServalAdministrationService } from './serval-administration.service';
import { ServalProjectComponent } from './serval-project.component';

const mockActivatedProjectService = mock(ActivatedProjectService);
const mockActivatedRoute = mock(ActivatedRoute);
const mockNoticeService = mock(NoticeService);
const mockSFProjectService = mock(SFProjectService);
const mockServalAdministrationService = mock(ServalAdministrationService);

describe('ServalProjectComponent', () => {
  configureTestingModule(() => ({
    imports: [
      HttpClientTestingModule,
      NoopAnimationsModule,
      ServalProjectComponent,
      TestOnlineStatusModule.forRoot(),
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY),
      TestTranslocoModule
    ],
    providers: [
      { provide: ActivatedProjectService, useMock: mockActivatedProjectService },
      { provide: NoticeService, useMock: mockNoticeService },
      { provide: ActivatedRoute, useMock: mockActivatedRoute },
      { provide: NoticeService, useMock: mockNoticeService },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService },
      { provide: ServalAdministrationService, useMock: mockServalAdministrationService },
      { provide: SFProjectService, useMock: mockSFProjectService }
    ]
  }));

  describe('pre-translation drafting checkbox', () => {
    it('should allow enabling pre-translation drafting', fakeAsync(() => {
      const env = new TestEnvironment(false);
      expect(env.preTranslateCheckbox.checked).toBe(false);
      env.clickElement(env.preTranslateCheckbox);
      expect(env.preTranslateCheckbox.checked).toBe(true);
      verify(mockSFProjectService.onlineSetPreTranslate(env.mockProjectId, true)).once();
    }));

    it('should allow disabling pre-translation drafting', fakeAsync(() => {
      const env = new TestEnvironment(true);
      expect(env.preTranslateCheckbox.checked).toBe(true);
      env.clickElement(env.preTranslateCheckbox);
      expect(env.preTranslateCheckbox.checked).toBe(false);
      verify(mockSFProjectService.onlineSetPreTranslate(env.mockProjectId, false)).once();
    }));

    it('should disable the pre-translation drafting checkbox when offline', fakeAsync(() => {
      const env = new TestEnvironment(true);
      env.onlineStatus = false;
      expect(env.preTranslateCheckbox.disabled).toBe(true);
    }));
  });

  describe('run webhook button', () => {
    it('should disable the run webhook button when offline', fakeAsync(() => {
      const env = new TestEnvironment(true);
      env.onlineStatus = false;
      expect(env.runWebhookButton.disabled).toBe(true);
    }));

    it('should allow running the webhook', fakeAsync(() => {
      const env = new TestEnvironment(false);
      expect(env.runWebhookButton.disabled).toBe(false);
      env.clickElement(env.runWebhookButton);
      verify(mockServalAdministrationService.onlineRetrievePreTranslationStatus(env.mockProjectId)).once();
      verify(mockNoticeService.show(anything())).once();
    }));
  });

  describe('download button', () => {
    it('should disable the download button when offline', fakeAsync(() => {
      const env = new TestEnvironment(true);
      env.onlineStatus = false;
      expect(env.firstDownloadButton.innerText).toBe('Download');
      expect(env.firstDownloadButton.disabled).toBe(true);
    }));

    it('should display a notice if the project cannot be downloaded', fakeAsync(() => {
      const env = new TestEnvironment(true);
      when(mockServalAdministrationService.downloadProject(anything())).thenReturn(
        throwError(() => new HttpErrorResponse({ status: 404 }))
      );
      expect(env.firstDownloadButton.innerText).toBe('Download');
      expect(env.firstDownloadButton.disabled).toBe(false);
      env.clickElement(env.firstDownloadButton);
      verify(mockNoticeService.showError(anything())).once();
    }));

    it('should have a download button', fakeAsync(() => {
      const env = new TestEnvironment(true);
      expect(env.firstDownloadButton.innerText).toBe('Download');
      expect(env.firstDownloadButton.disabled).toBe(false);
    }));
  });

  class TestEnvironment {
    readonly component: ServalProjectComponent;
    readonly fixture: ComponentFixture<ServalProjectComponent>;
    readonly testOnlineStatusService: TestOnlineStatusService = TestBed.inject(
      OnlineStatusService
    ) as TestOnlineStatusService;

    mockProjectId = 'project01';

    constructor(preTranslate: boolean) {
      const mockProjectId$ = new BehaviorSubject<string>(this.mockProjectId);
      const mockProjectDoc = {
        id: this.mockProjectId,
        data: createTestProjectProfile({
          name: 'Project 01',
          shortName: 'P1',
          translateConfig: {
            draftConfig: {
              alternateSource: {
                paratextId: 'ptproject03',
                projectRef: 'project03',
                name: 'Project 03',
                shortName: 'P3'
              },
              alternateTrainingSource: {
                paratextId: 'ptproject04',
                projectRef: 'project04',
                name: 'Project 04',
                shortName: 'P4'
              }
            },
            preTranslate: preTranslate,
            source: {
              paratextId: 'ptproject02',
              projectRef: 'project02',
              name: 'Project 02',
              shortName: 'P2'
            }
          }
        })
      } as SFProjectProfileDoc;
      const mockProjectDoc$ = new BehaviorSubject<SFProjectProfileDoc>(mockProjectDoc);

      when(mockActivatedProjectService.projectId).thenReturn(this.mockProjectId);
      when(mockActivatedProjectService.projectId$).thenReturn(mockProjectId$);
      when(mockActivatedProjectService.projectDoc).thenReturn(mockProjectDoc);
      when(mockActivatedProjectService.projectDoc$).thenReturn(mockProjectDoc$);

      this.fixture = TestBed.createComponent(ServalProjectComponent);
      this.component = this.fixture.componentInstance;
      this.fixture.detectChanges();
    }

    get preTranslateCheckbox(): HTMLInputElement {
      return this.fixture.nativeElement.querySelector('mat-checkbox input');
    }

    get runWebhookButton(): HTMLInputElement {
      return this.fixture.nativeElement.querySelector('button#run-webhook');
    }

    get firstDownloadButton(): HTMLInputElement {
      return this.fixture.nativeElement.querySelector('td button');
    }

    set onlineStatus(hasConnection: boolean) {
      this.testOnlineStatusService.setIsOnline(hasConnection);
      tick();
      this.fixture.detectChanges();
    }

    clickElement(button: HTMLElement): void {
      button.click();
      this.fixture.detectChanges();
      tick();
      this.fixture.detectChanges();
    }
  }
});
