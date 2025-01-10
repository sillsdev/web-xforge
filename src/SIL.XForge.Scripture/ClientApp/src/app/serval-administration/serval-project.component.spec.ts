import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import { saveAs } from 'file-saver';
import { SystemRole } from 'realtime-server/lib/esm/common/models/system-role';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { anything, mock, verify, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { AuthService } from 'xforge-common/auth.service';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { SFProjectProfileDoc } from '../core/models/sf-project-profile-doc';
import { SF_TYPE_REGISTRY } from '../core/models/sf-type-registry';
import { SFProjectService } from '../core/sf-project.service';
import { BuildDto } from '../machine-api/build-dto';
import { DraftZipProgress } from '../translate/draft-generation/draft-generation';
import { DraftGenerationService } from '../translate/draft-generation/draft-generation.service';
import { ServalAdministrationService } from './serval-administration.service';
import { ServalProjectComponent } from './serval-project.component';

const mockActivatedProjectService = mock(ActivatedProjectService);
const mockActivatedRoute = mock(ActivatedRoute);
const mockAuthService = mock(AuthService);
const mockDraftGenerationService = mock(DraftGenerationService);
const mockNoticeService = mock(NoticeService);
const mockSFProjectService = mock(SFProjectService);
const mockServalAdministrationService = mock(ServalAdministrationService);

describe('ServalProjectComponent', () => {
  configureTestingModule(() => ({
    imports: [
      NoopAnimationsModule,
      TestOnlineStatusModule.forRoot(),
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY),
      TestTranslocoModule
    ],
    providers: [
      { provide: ActivatedProjectService, useMock: mockActivatedProjectService },
      { provide: ActivatedRoute, useMock: mockActivatedRoute },
      { provide: AuthService, useMock: mockAuthService },
      { provide: DraftGenerationService, useMock: mockDraftGenerationService },
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

  describe('view event log button', () => {
    it('should disable the view event log button when offline', fakeAsync(() => {
      const env = new TestEnvironment(true);
      env.onlineStatus = false;
      expect(env.viewEventLogButton.ariaDisabled).toBe('true');
    }));

    it('should not disable the view event log button when online', fakeAsync(() => {
      const env = new TestEnvironment(false);
      env.onlineStatus = true;
      expect(env.viewEventLogButton.ariaDisabled).toBeNull();
    }));
  });

  describe('download button', () => {
    it('should disable the download button when offline', fakeAsync(() => {
      const env = new TestEnvironment(true);
      env.onlineStatus = false;
      expect(env.firstDownloadButton.innerText).toContain('Download');
      expect(env.firstDownloadButton.disabled).toBe(true);
    }));

    it('should display a notice if the project cannot be downloaded', fakeAsync(() => {
      const env = new TestEnvironment(true);
      when(mockServalAdministrationService.downloadProject(anything())).thenReturn(
        throwError(() => new HttpErrorResponse({ status: 404 }))
      );
      expect(env.firstDownloadButton.innerText).toContain('Download');
      expect(env.firstDownloadButton.disabled).toBe(false);
      env.clickElement(env.firstDownloadButton);
      verify(mockNoticeService.showError(anything())).once();
    }));

    it('should have a download button', fakeAsync(() => {
      const env = new TestEnvironment(true);
      expect(env.firstDownloadButton.innerText).toContain('Download');
      expect(env.firstDownloadButton.disabled).toBe(false);
    }));

    it('should allow clicking of the button to download', fakeAsync(() => {
      const env = new TestEnvironment(true);
      expect(env.firstDownloadButton.innerText).toContain('Download');
      expect(env.firstDownloadButton.disabled).toBe(false);
      env.clickElement(env.firstDownloadButton);
      expect(saveAs).toHaveBeenCalled();
    }));
  });

  describe('download draft button', () => {
    it('should disable the download button when offline', fakeAsync(() => {
      const env = new TestEnvironment(true);
      env.onlineStatus = false;
      expect(env.downloadDraftButton.disabled).toBe(true);
    }));

    it('should disable the download button when there is no last completed build', fakeAsync(() => {
      const env = new TestEnvironment(true);
      expect(env.downloadDraftButton.disabled).toBe(true);
    }));

    it('should have a download draft button when there is a last completed build', fakeAsync(() => {
      const env = new TestEnvironment(true, {} as BuildDto);
      expect(env.downloadDraftButton.disabled).toBe(false);
    }));

    it('should allow clicking of the download draft button to download a zip file', fakeAsync(() => {
      const env = new TestEnvironment(true, {} as BuildDto);
      when(mockDraftGenerationService.downloadGeneratedDraftZip(anything(), anything())).thenReturn(
        of({ current: 1, total: 2 } as DraftZipProgress)
      );
      expect(env.downloadDraftButton.disabled).toBe(false);
      env.clickElement(env.downloadDraftButton);
      expect(env.component.downloadBooksProgress).toBe(1);
      expect(env.component.downloadBooksTotal).toBe(2);
    }));

    it('should display any errors when downloading a zip file', fakeAsync(() => {
      const env = new TestEnvironment(true, {} as BuildDto);
      when(mockDraftGenerationService.downloadGeneratedDraftZip(anything(), anything())).thenReturn(
        throwError(() => new Error())
      );
      expect(env.downloadDraftButton.disabled).toBe(false);
      env.clickElement(env.downloadDraftButton);
      verify(mockNoticeService.showError(anything())).once();
    }));
  });

  describe('get last completed build', () => {
    it('does not get last completed build if project does not have draft books', fakeAsync(() => {
      const env = new TestEnvironment(false);
      tick();
      env.fixture.detectChanges();
      expect(env.component.preTranslate).toBe(false);
      verify(mockDraftGenerationService.getLastCompletedBuild(anything())).never();
      verify(mockDraftGenerationService.getBuildProgress(anything())).never();
    }));

    it('gets last completed build if drafting enabled and draft books exist', fakeAsync(() => {
      const env = new TestEnvironment(true, {} as BuildDto);
      tick();
      env.fixture.detectChanges();
      expect(env.component.preTranslate).toBe(true);
      verify(mockDraftGenerationService.getLastCompletedBuild(anything())).once();
      verify(mockDraftGenerationService.getBuildProgress(anything())).once();
    }));
  });

  class TestEnvironment {
    readonly component: ServalProjectComponent;
    readonly fixture: ComponentFixture<ServalProjectComponent>;
    readonly testOnlineStatusService: TestOnlineStatusService = TestBed.inject(
      OnlineStatusService
    ) as TestOnlineStatusService;

    mockProjectId = 'project01';

    constructor(preTranslate: boolean, lastCompletedBuild: BuildDto | undefined = undefined) {
      const mockProjectId$ = new BehaviorSubject<string>(this.mockProjectId);
      const mockProjectDoc = {
        id: this.mockProjectId,
        data: createTestProjectProfile({
          name: 'Project 01',
          shortName: 'P1',
          texts: [
            { bookNum: 1, chapters: [{ number: 1, hasDraft: false }] },
            { bookNum: 2, chapters: [{ number: 1, hasDraft: false }] },
            { bookNum: 3, chapters: [{ number: 1, hasDraft: preTranslate }] },
            { bookNum: 4, chapters: [{ number: 1, hasDraft: preTranslate }] }
          ],
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
              },
              lastSelectedTrainingBooks: preTranslate ? [1, 2] : [],
              lastSelectedTranslationBooks: preTranslate ? [3, 4] : [],
              lastSelectedTrainingScriptureRange: preTranslate ? 'GEN;EXO' : undefined,
              lastSelectedTranslationScriptureRange: preTranslate ? 'LEV;NUM' : undefined
            },
            preTranslate,
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

      when(mockDraftGenerationService.getLastCompletedBuild(this.mockProjectId)).thenReturn(of(lastCompletedBuild));
      when(mockDraftGenerationService.getBuildProgress(this.mockProjectId)).thenReturn(of(lastCompletedBuild));
      when(mockServalAdministrationService.downloadProject(anything())).thenReturn(of(new Blob()));
      when(mockAuthService.currentUserRoles).thenReturn([SystemRole.ServalAdmin]);
      when(mockDraftGenerationService.getBuildProgress(anything())).thenReturn(of({ additionalInfo: {} } as BuildDto));
      spyOn(saveAs, 'saveAs').and.stub();

      this.fixture = TestBed.createComponent(ServalProjectComponent);
      this.component = this.fixture.componentInstance;
      this.fixture.detectChanges();
    }

    get preTranslateCheckbox(): HTMLInputElement {
      return this.fixture.nativeElement.querySelector('mat-checkbox input');
    }

    get runWebhookButton(): HTMLInputElement {
      return this.fixture.nativeElement.querySelector('#run-webhook');
    }

    get viewEventLogButton(): HTMLAnchorElement {
      return this.fixture.nativeElement.querySelector('#view-event-log');
    }

    get firstDownloadButton(): HTMLInputElement {
      return this.fixture.nativeElement.querySelector('td button');
    }

    get downloadDraftButton(): HTMLInputElement {
      return this.fixture.nativeElement.querySelector('#download-draft');
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
