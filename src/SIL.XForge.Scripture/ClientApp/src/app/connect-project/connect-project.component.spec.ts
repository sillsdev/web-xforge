import { HttpErrorResponse } from '@angular/common/http';
import { DebugElement, ErrorHandler } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { SFProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { anything, deepEqual, mock, resetCalls, verify, when } from 'ts-mockito';
import { AuthService } from 'xforge-common/auth.service';
import { CommandError, CommandErrorCode } from 'xforge-common/command.service';
import { UNKNOWN_COMPONENT_OR_SERVICE } from 'xforge-common/models/realtime-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { ParatextProject } from '../core/models/paratext-project';
import { SFProjectCreateSettings } from '../core/models/sf-project-create-settings';
import { SFProjectDoc } from '../core/models/sf-project-doc';
import { SF_TYPE_REGISTRY } from '../core/models/sf-type-registry';
import { ParatextService, SelectableProjectWithLanguageCode } from '../core/paratext.service';
import { ProjectNotificationService } from '../core/project-notification.service';
import { SFProjectService } from '../core/sf-project.service';
import { ProjectSelectComponent } from '../project-select/project-select.component';
import { SyncProgressComponent } from '../sync/sync-progress/sync-progress.component';
import { ConnectProjectComponent } from './connect-project.component';

interface TestEnvironmentParams {
  hasConnection?: boolean;
  paratextId?: string | null;
}

const mockedAuthService = mock(AuthService);
const mockedParatextService = mock(ParatextService);
const mockedProjectNotificationService = mock(ProjectNotificationService);
const mockedRouter = mock(Router);
const mockedSFProjectService = mock(SFProjectService);
const mockedNoticeService = mock(NoticeService);
const mockedErrorHandler = mock(ErrorHandler);

describe('ConnectProjectComponent', () => {
  configureTestingModule(() => ({
    imports: [
      NoopAnimationsModule,
      UICommonModule,
      TestTranslocoModule,
      TestOnlineStatusModule.forRoot(),
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)
    ],
    declarations: [ConnectProjectComponent, ProjectSelectComponent, SyncProgressComponent],
    providers: [
      { provide: AuthService, useMock: mockedAuthService },
      { provide: ParatextService, useMock: mockedParatextService },
      { provide: ProjectNotificationService, useMock: mockedProjectNotificationService },
      { provide: Router, useMock: mockedRouter },
      { provide: SFProjectService, useMock: mockedSFProjectService },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: ErrorHandler, useMock: mockedErrorHandler },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService }
    ]
  }));

  it('should show no projects if cannot access projects', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectsResources(undefined, undefined);
    env.waitForProjectsResponse();
    expect(env.component.projects).toEqual([]);
  }));

  it('should display form when PT projects is empty', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectsResources([], []);
    env.waitForProjectsResponse();
    expect(env.projectTitle).toContain('ENG - English');
    expect(env.component.state).toEqual('input');
    expect(env.connectProjectForm).not.toBeNull();
  }));

  it('should display projects then resources', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupDefaultProjectData();
    env.waitForProjectsResponse();
    expect(env.component.state).toEqual('input');
    expect(env.connectProjectForm).not.toBeNull();

    env.clickElement(env.inputElement(env.checkingCheckbox));

    env.openSourceProjectAutocomplete();
    // NOTE: The source projects list excludes pt01 (as it is our selected project above)
    expect(env.selectableSourceProjectsAndResources.projects.length).toEqual(3);
    expect(env.selectableSourceProjectsAndResources.resources.length).toEqual(3);
    // NOTE: Angular inserts the group name (in brackets) in a hidden span at the end for the Safari screen reader
    expect(env.selectableSourceProjectsAndResources.projects[2]).toContain('THA - Thai');
    expect(env.selectableSourceProjectsAndResources.resources[0]).toContain('SJL - Sob Jonah and Luke');
    expect(env.component.connectProjectForm.valid).toBe(true);
    env.clickElement(env.submitButton);
  }));

  it('should redirect to my projects if missing paratext id in params', fakeAsync(() => {
    const env = new TestEnvironment({ paratextId: undefined });
    env.setupProjectsResources();
    env.waitForProjectsResponse();
    expect(env.component.ptProjectId).toEqual('');
    verify(mockedRouter.navigate(deepEqual(['/projects']))).once();
  }));

  it('page is instantly available without waiting for projects', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectsResources(env.paratextProjects, []);
    env.fixture.detectChanges();

    expect(env.component.state).toEqual('input');
    verify(mockedNoticeService.loadingStarted(anything())).once();
    expect(env.component.showSettings).toBe(true);
    expect(env.component.projects.length).toEqual(0);
    expect(env.submitButton.nativeElement.disabled).toBe(true);

    tick();
    env.fixture.detectChanges();

    expect(env.component.state).toEqual('input');
    expect(env.connectProjectForm).not.toBeNull();
    expect(env.component.projects.length).toEqual(env.paratextProjects.length);
    expect(env.submitButton.nativeElement.disabled).toBe(false);
    verify(mockedNoticeService.loadingFinished(anything())).once();
  }));

  it('disables page if offline', fakeAsync(() => {
    const env = new TestEnvironment({ hasConnection: false });
    env.setupDefaultProjectData();
    env.fixture.detectChanges();
    expect(env.component.state).toEqual('offline');
    expect(env.offlineMessage).not.toBeNull();
    expect(env.component.connectProjectForm.disabled).toBe(true);
    expect(env.submitButton.nativeElement.disabled).toBe(true);

    env.onlineStatus = true;
    expect(env.offlineMessage).toBeNull();
    expect(env.component.state).toEqual('input');
    expect(env.component.connectProjectForm.enabled).toBe(true);
    expect(env.submitButton.nativeElement.disabled).toBe(false);

    env.onlineStatus = false;
    expect(env.component.state).toEqual('offline');
  }));

  it('should create when non-existent project is selected', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupDefaultProjectData();
    env.waitForProjectsResponse();
    expect(env.component.state).toEqual('input');
    expect(env.projectTitle).toContain('ENG - English');

    env.clickElement(env.inputElement(env.checkingCheckbox));

    env.selectSourceProject('pt04');
    expect(env.component.connectProjectForm.valid).toBe(true);

    env.clickElement(env.submitButton);
    expect(env.projectTitle).toBeUndefined();
    expect(env.component.state).toEqual('connecting');
    expect(env.submitButton).toBeNull();
    expect(env.progressBar).not.toBeNull();
    env.setQueuedCount();
    env.emitSyncComplete();

    const settings: SFProjectCreateSettings = {
      paratextId: 'pt01',
      checkingEnabled: false,
      sourceParatextId: 'pt04'
    };
    verify(mockedSFProjectService.onlineCreate(deepEqual(settings))).once();
    verify(mockedRouter.navigate(deepEqual(['/projects', 'project01']))).once();
  }));

  it('should create when no setting is selected', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupDefaultProjectData();
    env.waitForProjectsResponse();
    expect(env.component.state).toEqual('input');
    expect(env.inputElement(env.checkingCheckbox).checked).toBe(true);

    env.clickElement(env.submitButton);
    tick();

    expect(env.component.state).toEqual('connecting');
    expect(env.progressBar).not.toBeNull();
    env.setQueuedCount();
    env.emitSyncComplete();

    const project: SFProjectCreateSettings = {
      paratextId: 'pt01',
      checkingEnabled: true,
      sourceParatextId: null
    };
    verify(mockedSFProjectService.onlineCreate(deepEqual(project))).once();
    verify(mockedRouter.navigate(deepEqual(['/projects', 'project01']))).once();
  }));

  it('handles already connected error', fakeAsync(() => {
    // Another user might have _just_ connected this PT project. We could respond by joining this user to the
    // now-connected project. But the user may have made Translation or Checking selections on the Connect Project page
    // that will have mysteriously been ignored. So for the unlikely event that two users connect the same project at
    // the same time, give one user an error and they can try the process again, and probably join the now-connected
    // project the second time they try.
    const env = new TestEnvironment();
    env.setupDefaultProjectData();
    env.waitForProjectsResponse();
    expect(env.component.state).toEqual('input');
    expect(env.inputElement(env.checkingCheckbox).checked).toBe(true);
    // Simulate someone else connecting the PT project to SF while we are working on the Connect Project form.
    when(mockedSFProjectService.onlineCreate(anything())).thenThrow(
      new CommandError(CommandErrorCode.InvalidParams, ConnectProjectComponent.errorAlreadyConnectedKey, null)
    );
    when(mockedErrorHandler.handleError(anything())).thenReturn();

    resetCalls(mockedParatextService);
    // SUT
    env.clickElement(env.submitButton);
    tick();
    env.fixture.detectChanges();
    tick();

    verify(mockedParatextService.getProjects()).once();
    verify(mockedParatextService.getResources()).once();
    verify(mockedErrorHandler.handleError(anything())).once();
    expect(env.component.state).toEqual('input');
    expect(env.progressBar).toBeNull();
    verify(mockedSFProjectService.onlineCreate(anything())).once();
    verify(mockedSFProjectService.onlineAddCurrentUser(anything())).never();
    verify(mockedRouter.navigate(deepEqual(['/projects', 'project01']))).never();
  }));

  it('shows error message when resources fail to load, but still allows selecting a based on project', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupDefaultProjectData();
    when(mockedParatextService.getResources()).thenReject(new Error('Failed to fetch resources'));
    env.waitForProjectsResponse();

    expect(env.component.state).toEqual('input');

    expect(env.resourceLoadingErrorMessage.nativeElement.textContent).toContain('error fetching');

    env.selectSourceProject('pt04');
    expect(env.component.connectProjectForm.valid).toBe(true);
    env.clickElement(env.submitButton);

    expect(env.component.state).toEqual('connecting');
    env.setQueuedCount();
    env.emitSyncComplete();

    const settings: SFProjectCreateSettings = {
      paratextId: 'pt01',
      checkingEnabled: true,
      sourceParatextId: 'pt04'
    };
    verify(mockedSFProjectService.onlineCreate(deepEqual(settings))).once();
    verify(mockedRouter.navigate(deepEqual(['/projects', 'project01']))).once();
  }));

  it('knows what PT project id the prior page asked to connect to', fakeAsync(() => {
    const env = new TestEnvironment({ paratextId: 'requested-pt-project-id' });
    env.setupDefaultProjectData();
    env.waitForProjectsResponse();
    expect(env.component.state).toEqual('input');
    expect(env.component.ptProjectId).toEqual('requested-pt-project-id');
  }));

  it('should display the Paratext credentials update prompt when get projects throws a forbidden error', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupDefaultProjectData();
    when(mockedParatextService.getProjects()).thenThrow(new HttpErrorResponse({ status: 401 }));
    env.waitForProjectsResponse();

    verify(mockedParatextService.getProjects()).once();
    verify(mockedAuthService.requestParatextCredentialUpdate(anything())).once();
    expect(env.component.state).toEqual('input');
  }));
});

class TestEnvironment {
  readonly component: ConnectProjectComponent;
  readonly fixture: ComponentFixture<ConnectProjectComponent>;
  readonly testOnlineStatusService: TestOnlineStatusService = TestBed.inject(
    OnlineStatusService
  ) as TestOnlineStatusService;

  paratextProjects: ParatextProject[] = [
    {
      paratextId: 'pt01',
      name: 'English',
      shortName: 'ENG',
      languageTag: 'en',
      isConnectable: true,
      isConnected: false
    },
    {
      paratextId: 'pt02',
      projectId: 'project02',
      name: 'Maori',
      shortName: 'MRI',
      languageTag: 'mri',
      isConnectable: false,
      isConnected: true
    },
    {
      paratextId: 'pt04',
      name: 'Spanish',
      shortName: 'ESP',
      languageTag: 'es',
      isConnectable: false,
      isConnected: false
    },
    {
      paratextId: 'pt03',
      projectId: 'project03',
      name: 'Thai',
      shortName: 'THA',
      languageTag: 'th',
      isConnectable: true,
      isConnected: true
    }
  ];

  private resources: SelectableProjectWithLanguageCode[] = [
    { paratextId: 'e01f11e9b4b8e338', name: 'Sob Jonah and Luke', shortName: 'SJL', languageTag: 'en' },
    {
      paratextId: '5e51f89e89947acb',
      name: 'Aruamu New Testament [msy] Papua New Guinea 2004 DBL',
      shortName: 'ANT',
      languageTag: 'en'
    },
    {
      paratextId: '9bb76cd3e5a7f9b4',
      name: 'Revised Version with Apocrypha 1885, 1895',
      shortName: 'RVA',
      languageTag: 'en'
    }
  ];
  private readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

  constructor(params: TestEnvironmentParams = { paratextId: null }) {
    when(mockedSFProjectService.onlineCreate(anything())).thenCall((settings: SFProjectCreateSettings) => {
      const newProject: SFProject = createTestProject({
        paratextId: settings.paratextId,
        translateConfig: {
          translationSuggestionsEnabled: false,
          source:
            settings.sourceParatextId == null
              ? undefined
              : {
                  paratextId: settings.sourceParatextId,
                  projectRef: 'project02',
                  name: 'Source',
                  shortName: 'SRC',
                  writingSystem: { tag: 'qaa' }
                }
        },
        checkingConfig: {
          checkingEnabled: settings.checkingEnabled
        },
        sync: { queuedCount: 1 },
        userRoles: {
          user01: SFProjectRole.ParatextAdministrator
        },
        paratextUsers: [{ sfUserId: 'user01', username: 'ptuser01', opaqueUserId: 'opaqueuser01' }]
      });
      this.realtimeService.create(SFProjectDoc.COLLECTION, 'project01', newProject, UNKNOWN_COMPONENT_OR_SERVICE);
      return Promise.resolve('project01');
    });
    when(mockedSFProjectService.subscribe('project01', anything())).thenCall(() =>
      this.realtimeService.subscribe(SFProjectDoc.COLLECTION, 'project01', UNKNOWN_COMPONENT_OR_SERVICE)
    );
    if (params.paratextId === undefined) {
      when(mockedRouter.getCurrentNavigation()).thenReturn({ extras: {} } as any);
    } else {
      const paratextId = params.paratextId ?? 'pt01';
      const name: string | undefined = this.paratextProjects.find(p => p.paratextId === paratextId)?.name;
      const shortName: string | undefined = this.paratextProjects.find(p => p.paratextId === paratextId)?.shortName;

      when(mockedRouter.getCurrentNavigation()).thenReturn({
        extras: { state: { paratextId, name, shortName } }
      } as any);
    }
    when(mockedSFProjectService.onlineAddCurrentUser('project01')).thenResolve();
    this.testOnlineStatusService.setIsOnline(params.hasConnection ?? true);
    this.fixture = TestBed.createComponent(ConnectProjectComponent);
    this.component = this.fixture.componentInstance;
  }

  get submitButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('#connect-submit-button'));
  }

  get projectTitle(): string | undefined {
    return this.fixture.debugElement.query(By.css('.project-title'))?.nativeElement.textContent;
  }

  get connectProjectForm(): DebugElement {
    return this.fixture.debugElement.query(By.css('form'));
  }

  get settingsCard(): DebugElement {
    return this.fixture.debugElement.query(By.css('#settings-card'));
  }

  get checkingCheckbox(): DebugElement {
    return this.fixture.debugElement.query(By.css('#checking-checkbox'));
  }

  get sourceProjectSelect(): DebugElement {
    return this.fixture.debugElement.query(By.css('app-project-select'));
  }

  get progressBar(): DebugElement {
    return this.fixture.debugElement.query(By.css('mat-progress-bar'));
  }

  get offlineMessage(): DebugElement {
    return this.fixture.debugElement.query(By.css('.offline-text'));
  }

  set onlineStatus(hasConnection: boolean) {
    this.testOnlineStatusService.setIsOnline(hasConnection);
    tick();
    this.fixture.detectChanges();
  }

  get sourceProjectSelectComponent(): ProjectSelectComponent {
    return this.sourceProjectSelect.componentInstance as ProjectSelectComponent;
  }

  get selectableSourceProjectsAndResources(): { projects: string[]; resources: string[] } {
    const groups = (this.sourceProjectSelectComponent.autocomplete.panel.nativeElement as HTMLElement).querySelectorAll(
      'mat-optgroup'
    );
    const [projects, resources] = [groups[0], groups[1]].map(group =>
      Array.from(group.querySelectorAll('mat-option')).map(option => option.textContent || '')
    );
    return { projects, resources };
  }

  get resourceLoadingErrorMessage(): DebugElement {
    return this.fixture.debugElement.query(By.css('app-project-select + mat-error'));
  }

  selectSourceProject(projectId: string): void {
    this.sourceProjectSelectComponent.value = projectId;
    this.fixture.detectChanges();
    tick();
    this.fixture.detectChanges();
  }

  openSourceProjectAutocomplete(): void {
    this.sourceProjectSelectComponent.autocompleteTrigger.openPanel();
    this.fixture.detectChanges();
    tick();
  }

  clickElement(element: HTMLElement | DebugElement): void {
    if (element instanceof DebugElement) {
      element = (element as DebugElement).nativeElement as HTMLElement;
    }
    element.click();
    this.fixture.detectChanges();
    tick();
    this.fixture.detectChanges();
  }

  inputElement(element: DebugElement): HTMLInputElement {
    return element.nativeElement.querySelector('input') as HTMLInputElement;
  }

  setQueuedCount(): void {
    const projectDoc = this.realtimeService.get<SFProjectDoc>(
      SFProjectDoc.COLLECTION,
      'project01',
      UNKNOWN_COMPONENT_OR_SERVICE
    );
    projectDoc.submitJson0Op(op => op.set<number>(p => p.sync.queuedCount, 1), false);
    tick();
    this.fixture.detectChanges();
  }

  emitSyncComplete(): void {
    const projectDoc = this.realtimeService.get<SFProjectDoc>(
      SFProjectDoc.COLLECTION,
      'project01',
      UNKNOWN_COMPONENT_OR_SERVICE
    );
    projectDoc.submitJson0Op(op => {
      op.set<number>(p => p.sync.queuedCount, 0);
      op.set<boolean>(p => p.sync.lastSyncSuccessful!, true);
      op.set(p => p.sync.dateLastSuccessfulSync!, new Date().toJSON());
    }, false);
    this.fixture.detectChanges();
  }

  setupProjectsResources(projects?: ParatextProject[], resources?: SelectableProjectWithLanguageCode[]): void {
    when(mockedParatextService.getProjects()).thenResolve(projects);
    when(mockedParatextService.getResources()).thenResolve(resources);
  }

  setupDefaultProjectData(): void {
    this.setupProjectsResources(this.paratextProjects, this.resources);
  }

  waitForProjectsResponse(): void {
    tick();
    this.fixture.detectChanges();
    tick();
    this.fixture.detectChanges();
  }
}
