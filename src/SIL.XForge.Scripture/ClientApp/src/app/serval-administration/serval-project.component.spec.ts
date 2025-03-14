import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import { saveAs } from 'file-saver';
import { SystemRole } from 'realtime-server/lib/esm/common/models/system-role';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { DraftConfig, TranslateSource } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { getTranslateSource } from 'realtime-server/lib/esm/scriptureforge/models/translate-source-test-data';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { anything, mock, verify, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { AuthService } from 'xforge-common/auth.service';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { SFProjectProfileDoc } from '../core/models/sf-project-profile-doc';
import { SFProjectService } from '../core/sf-project.service';
import { BuildDto } from '../machine-api/build-dto';
import { DraftZipProgress } from '../translate/draft-generation/draft-generation';
import { DraftGenerationService } from '../translate/draft-generation/draft-generation.service';
import { ServalAdministrationService } from './serval-administration.service';
import { ServalProjectComponent } from './serval-project.component';

interface TestEnvironmentArgs {
  preTranslate: boolean;
  lastCompletedBuild?: BuildDto;
  draftConfig?: Partial<DraftConfig>;
}

const mockActivatedProjectService = mock(ActivatedProjectService);
const mockActivatedRoute = mock(ActivatedRoute);
const mockAuthService = mock(AuthService);
const mockDraftGenerationService = mock(DraftGenerationService);
const mockNoticeService = mock(NoticeService);
const mockSFProjectService = mock(SFProjectService);
const mockServalAdministrationService = mock(ServalAdministrationService);

describe('ServalProjectComponent', () => {
  configureTestingModule(() => ({
    imports: [NoopAnimationsModule, TestOnlineStatusModule.forRoot()],
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
      const env = new TestEnvironment({ preTranslate: false });
      expect(env.preTranslateCheckbox.checked).toBe(false);
      env.clickElement(env.preTranslateCheckbox);
      expect(env.preTranslateCheckbox.checked).toBe(true);
      verify(mockSFProjectService.onlineSetPreTranslate(env.PROJECT01ID, true)).once();
    }));

    it('should allow disabling pre-translation drafting', fakeAsync(() => {
      const env = new TestEnvironment();
      expect(env.preTranslateCheckbox.checked).toBe(true);
      env.clickElement(env.preTranslateCheckbox);
      expect(env.preTranslateCheckbox.checked).toBe(false);
      verify(mockSFProjectService.onlineSetPreTranslate(env.PROJECT01ID, false)).once();
    }));

    it('should disable the pre-translation drafting checkbox when offline', fakeAsync(() => {
      const env = new TestEnvironment();
      env.onlineStatus = false;
      expect(env.preTranslateCheckbox.disabled).toBe(true);
    }));
  });

  describe('run webhook button', () => {
    it('should disable the run webhook button when offline', fakeAsync(() => {
      const env = new TestEnvironment();
      env.onlineStatus = false;
      expect(env.runWebhookButton.disabled).toBe(true);
    }));

    it('should allow running the webhook', fakeAsync(() => {
      const env = new TestEnvironment({ preTranslate: false });
      expect(env.runWebhookButton.disabled).toBe(false);
      env.clickElement(env.runWebhookButton);
      verify(mockServalAdministrationService.onlineRetrievePreTranslationStatus(env.PROJECT01ID)).once();
      verify(mockNoticeService.show(anything())).once();
    }));
  });

  describe('view event log button', () => {
    it('should disable the view event log button when offline', fakeAsync(() => {
      const env = new TestEnvironment();
      env.onlineStatus = false;
      expect(env.viewEventLogButton.ariaDisabled).toBe('true');
    }));

    it('should not disable the view event log button when online', fakeAsync(() => {
      const env = new TestEnvironment();
      env.onlineStatus = true;
      expect(env.viewEventLogButton.ariaDisabled).toBeNull();
    }));
  });

  describe('download button', () => {
    it('should disable the download button when offline', fakeAsync(() => {
      const env = new TestEnvironment();
      env.onlineStatus = false;
      expect(env.firstDownloadButton.innerText).toContain('Download');
      expect(env.firstDownloadButton.disabled).toBe(true);
    }));

    it('should display a notice if the project cannot be downloaded', fakeAsync(() => {
      const env = new TestEnvironment();
      when(mockServalAdministrationService.downloadProject(anything())).thenReturn(
        throwError(() => new HttpErrorResponse({ status: 404 }))
      );
      expect(env.firstDownloadButton.innerText).toContain('Download');
      expect(env.firstDownloadButton.disabled).toBe(false);
      env.clickElement(env.firstDownloadButton);
      verify(mockNoticeService.showError(anything())).once();
    }));

    it('should have a download button', fakeAsync(() => {
      const env = new TestEnvironment();
      expect(env.downloadButtions.length).toBe(4);
      expect(env.firstDownloadButton.innerText).toContain('Download');
      expect(env.firstDownloadButton.disabled).toBe(false);
    }));

    it('should allow clicking of the button to download', fakeAsync(() => {
      const env = new TestEnvironment();
      expect(env.firstDownloadButton.innerText).toContain('Download');
      expect(env.firstDownloadButton.disabled).toBe(false);
      env.clickElement(env.firstDownloadButton);
      expect(saveAs).toHaveBeenCalled();
    }));
  });

  describe('download draft button', () => {
    it('should disable the download button when offline', fakeAsync(() => {
      const env = new TestEnvironment();
      env.onlineStatus = false;
      expect(env.downloadDraftButton.disabled).toBe(true);
    }));

    it('should disable the download button when there is no last completed build', fakeAsync(() => {
      const env = new TestEnvironment();
      expect(env.downloadDraftButton.disabled).toBe(true);
    }));

    it('should have a download draft button when there is a last completed build', fakeAsync(() => {
      const env = new TestEnvironment({ preTranslate: true, lastCompletedBuild: {} as BuildDto });
      expect(env.downloadDraftButton.disabled).toBe(false);
    }));

    it('should allow clicking of the download draft button to download a zip file', fakeAsync(() => {
      const env = new TestEnvironment({ preTranslate: true, lastCompletedBuild: {} as BuildDto });
      when(mockDraftGenerationService.downloadGeneratedDraftZip(anything(), anything())).thenReturn(
        of({ current: 1, total: 2 } as DraftZipProgress)
      );
      expect(env.downloadDraftButton.disabled).toBe(false);
      env.clickElement(env.downloadDraftButton);
      expect(env.component.downloadBooksProgress).toBe(1);
      expect(env.component.downloadBooksTotal).toBe(2);
    }));

    it('should display any errors when downloading a zip file', fakeAsync(() => {
      const env = new TestEnvironment({ preTranslate: true, lastCompletedBuild: {} as BuildDto });
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
      const env = new TestEnvironment({ preTranslate: false });
      tick();
      env.fixture.detectChanges();
      expect(env.component.preTranslate).toBe(false);
      verify(mockDraftGenerationService.getLastCompletedBuild(anything())).never();
      verify(mockDraftGenerationService.getBuildProgress(anything())).never();
    }));

    it('gets last completed build if drafting enabled and draft books exist', fakeAsync(() => {
      const env = new TestEnvironment({ preTranslate: true, lastCompletedBuild: {} as BuildDto });
      tick();
      env.fixture.detectChanges();
      expect(env.component.preTranslate).toBe(true);
      verify(mockDraftGenerationService.getLastCompletedBuild(anything())).once();
      verify(mockDraftGenerationService.getBuildProgress(anything())).once();
    }));
  });

  describe('last draft configuration', () => {
    it('shows the last draft configs no training books', fakeAsync(() => {
      const env = new TestEnvironment({ preTranslate: true, draftConfig: {} });
      const trainingSources = env.trainingSources;
      expect(trainingSources.length).toEqual(1);
      expect(trainingSources[0].textContent).toEqual('None');
      expect(env.TranslationSourceBookNames).toEqual('Leviticus, Numbers');
    }));

    it('shows the last draft configs single training source', fakeAsync(() => {
      const env = new TestEnvironment();
      const trainingSources = env.trainingSources;
      expect(trainingSources.length).toEqual(1);
      expect(env.getTrainingSourceBookNames(trainingSources[0])).toEqual('Genesis, Exodus');
      expect(env.TranslationSourceBookNames).toEqual('Leviticus, Numbers');
    }));

    it('shows the last draft configs multiple training sources', fakeAsync(() => {
      const env = new TestEnvironment({
        preTranslate: true,
        draftConfig: {
          lastSelectedTrainingScriptureRange: undefined,
          lastSelectedTrainingScriptureRanges: [
            { projectId: 'project04', scriptureRange: 'GEN;EXO' },
            { projectId: 'project05', scriptureRange: 'GEN' }
          ]
        } as DraftConfig
      });
      const trainingSources = env.trainingSources;
      expect(trainingSources.length).toEqual(2);
      expect(env.getTrainingSourceBookNames(trainingSources[0])).toEqual('Genesis, Exodus');
      expect(env.getTrainingSourceBookNames(trainingSources[1])).toEqual('Genesis');
      expect(env.TranslationSourceBookNames).toEqual('Leviticus, Numbers');
    }));
  });

  class TestEnvironment {
    readonly PROJECT01ID = 'project01';
    readonly source2: TranslateSource = getTranslateSource('2', false);
    readonly source3: TranslateSource = getTranslateSource('3', false);
    readonly source4: TranslateSource = getTranslateSource('4', false);
    readonly source5: TranslateSource = getTranslateSource('5', false);

    readonly component: ServalProjectComponent;
    readonly fixture: ComponentFixture<ServalProjectComponent>;
    readonly testOnlineStatusService: TestOnlineStatusService = TestBed.inject(
      OnlineStatusService
    ) as TestOnlineStatusService;

    constructor(args: TestEnvironmentArgs = { preTranslate: true }) {
      const mockProjectId$ = new BehaviorSubject<string>(this.PROJECT01ID);
      const mockProjectDoc = {
        id: this.PROJECT01ID,
        data: createTestProjectProfile({
          name: 'Project 01',
          shortName: 'P1',
          texts: [
            { bookNum: 1, chapters: [{ number: 1, hasDraft: false }] },
            { bookNum: 2, chapters: [{ number: 1, hasDraft: false }] },
            { bookNum: 3, chapters: [{ number: 1, hasDraft: args.preTranslate }] },
            { bookNum: 4, chapters: [{ number: 1, hasDraft: args.preTranslate }] }
          ],
          translateConfig: {
            draftConfig: {
              alternateSourceEnabled: true,
              alternateSource: this.source3,
              alternateTrainingSourceEnabled: true,
              alternateTrainingSource: this.source4,
              additionalTrainingSourceEnabled: true,
              additionalTrainingSource: this.source5,
              lastSelectedTrainingBooks: args.preTranslate ? [1, 2] : [],
              lastSelectedTranslationBooks: args.preTranslate ? [3, 4] : [],
              lastSelectedTrainingScriptureRange: args.preTranslate
                ? args.draftConfig != null
                  ? args.draftConfig.lastSelectedTrainingScriptureRange
                  : 'GEN;EXO'
                : undefined,
              lastSelectedTrainingScriptureRanges: args.draftConfig?.lastSelectedTrainingScriptureRanges ?? undefined,
              lastSelectedTranslationScriptureRange: args.preTranslate ? 'LEV;NUM' : undefined
            },
            preTranslate: args.preTranslate,
            source: this.source2
          }
        })
      } as SFProjectProfileDoc;
      const mockProjectDoc$ = new BehaviorSubject<SFProjectProfileDoc>(mockProjectDoc);

      when(mockActivatedProjectService.projectId).thenReturn(this.PROJECT01ID);
      when(mockActivatedProjectService.projectId$).thenReturn(mockProjectId$);
      when(mockActivatedProjectService.projectDoc).thenReturn(mockProjectDoc);
      when(mockActivatedProjectService.projectDoc$).thenReturn(mockProjectDoc$);
      when(mockSFProjectService.onlineGetDraftSources(this.PROJECT01ID)).thenResolve({
        draftingSources: [this.source3],
        trainingSources: [this.source4, this.source5],
        trainingTargets: []
      });
      when(mockDraftGenerationService.getLastCompletedBuild(this.PROJECT01ID)).thenReturn(of(args.lastCompletedBuild));
      when(mockDraftGenerationService.getBuildProgress(this.PROJECT01ID)).thenReturn(of(args.lastCompletedBuild));
      when(mockServalAdministrationService.downloadProject(anything())).thenReturn(of(new Blob()));
      when(mockAuthService.currentUserRoles).thenReturn([SystemRole.ServalAdmin]);
      when(mockDraftGenerationService.getBuildProgress(anything())).thenReturn(of({ additionalInfo: {} } as BuildDto));
      spyOn(saveAs, 'saveAs').and.stub();

      this.fixture = TestBed.createComponent(ServalProjectComponent);
      this.component = this.fixture.componentInstance;
      tick();
      this.fixture.detectChanges();
      tick();
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

    get downloadButtions(): NodeListOf<HTMLButtonElement> {
      return this.fixture.nativeElement.querySelectorAll('td button');
    }

    get downloadDraftButton(): HTMLInputElement {
      return this.fixture.nativeElement.querySelector('#download-draft');
    }

    get trainingSources(): NodeListOf<HTMLElement> {
      return this.fixture.nativeElement.querySelectorAll('.training');
    }

    get TranslationSourceBookNames(): string {
      return this.fixture.nativeElement.querySelector('.translation-range').textContent;
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

    getTrainingSourceBookNames(node: HTMLElement): string {
      return node.querySelector('.training-source-range')?.textContent ?? '';
    }
  }
});
