import { HttpClientTestingModule } from '@angular/common/http/testing';
import { DebugElement, ErrorHandler } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { AbstractControl } from '@angular/forms';
import { MatSelect } from '@angular/material/select';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { SFProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { anything, deepEqual, mock, objectContaining, resetCalls, verify, when } from 'ts-mockito';
import { CommandError, CommandErrorCode } from 'xforge-common/command.service';
import { I18nService } from 'xforge-common/i18n.service';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { ParatextProject } from '../core/models/paratext-project';
import { SFProjectCreateSettings } from '../core/models/sf-project-create-settings';
import { SFProjectDoc } from '../core/models/sf-project-doc';
import { SF_TYPE_REGISTRY } from '../core/models/sf-type-registry';
import { ParatextService, SelectableProject } from '../core/paratext.service';
import { ProjectNotificationService } from '../core/project-notification.service';
import { SFProjectService } from '../core/sf-project.service';
import { ProjectSelectComponent } from '../project-select/project-select.component';
import { SyncProgressComponent } from '../sync/sync-progress/sync-progress.component';
import { ConnectProjectComponent } from './connect-project.component';

const mockedParatextService = mock(ParatextService);
const mockedProjectNotificationService = mock(ProjectNotificationService);
const mockedRouter = mock(Router);
const mockedSFProjectService = mock(SFProjectService);
const mockedUserService = mock(UserService);
const mockedNoticeService = mock(NoticeService);
const mockedI18nService = mock(I18nService);
const mockedErrorHandler = mock(ErrorHandler);

describe('ConnectProjectComponent', () => {
  configureTestingModule(() => ({
    imports: [
      HttpClientTestingModule,
      NoopAnimationsModule,
      UICommonModule,
      TestTranslocoModule,
      TestOnlineStatusModule.forRoot(),
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)
    ],
    declarations: [ConnectProjectComponent, ProjectSelectComponent, SyncProgressComponent],
    providers: [
      { provide: ParatextService, useMock: mockedParatextService },
      { provide: ProjectNotificationService, useMock: mockedProjectNotificationService },
      { provide: Router, useMock: mockedRouter },
      { provide: SFProjectService, useMock: mockedSFProjectService },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: I18nService, useMock: mockedI18nService },
      { provide: ErrorHandler, useMock: mockedErrorHandler },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService }
    ]
  }));

  it('should display login button when PT projects is null', fakeAsync(() => {
    const env = new TestEnvironment({});
    env.setupProjectsAndResources(undefined, undefined);
    env.waitForProjectsResponse();

    expect(env.component.state).toEqual('login');
    expect(env.loginButton).not.toBeNull();
    expect(env.loginButton.nativeElement.disabled).toBe(false);
    env.onlineStatus = false;
    expect(env.loginButton).toBeNull();
  }));

  it('should display form when PT projects is empty', fakeAsync(() => {
    const env = new TestEnvironment({});
    env.setupProjectsAndResources([], []);
    env.waitForProjectsResponse();
    expect(env.component.state).toEqual('input');
    expect(env.connectProjectForm).not.toBeNull();
    expect(env.projectSelect).toBeNull();
    expect(env.noProjectsMessage.nativeElement.textContent).toBe('A translated string.');
  }));

  it('should display projects then resources', fakeAsync(() => {
    const env = new TestEnvironment({});
    env.setupDefaultProjectData();
    const projectCount: number = 6;
    const resourceCount: number = 3;

    env.waitForProjectsResponse();
    expect(env.component.state).toEqual('input');
    expect(env.connectProjectForm).not.toBeNull();

    env.changeSelectValue(env.projectSelect, 'pt01');

    env.clickElement(env.inputElement(env.checkingCheckbox));

    expect(env.translationSuggestionsCheckbox).toBeNull();
    env.openSourceProjectAutocomplete();
    // NOTE: The source projects list excludes pt01 (as it is our selected project above)
    expect(env.selectableSourceProjectsAndResources.projects.length).toEqual(projectCount - 1);
    expect(env.selectableSourceProjectsAndResources.resources.length).toEqual(resourceCount);
    expect(env.selectableSourceProjectsAndResources.projects).toContain('THA - Thai');
    expect(env.selectableSourceProjectsAndResources.resources[0]).toBe('SJL - Sob Jonah and Luke');
    expect(env.component.connectProjectForm.valid).toBe(true);
    env.clickElement(env.submitButton);
  }));

  it('should do nothing when form is invalid', fakeAsync(() => {
    const env = new TestEnvironment({});
    env.setupProjectsAndResources([], []);
    env.waitForProjectsResponse();

    expect(env.submitButton.nativeElement.disabled).toBe(true);
    env.clickElement(env.submitButton);

    verify(mockedSFProjectService.onlineCreate(anything())).never();
    verify(mockedSFProjectService.onlineAddCurrentUser(anything(), anything())).never();
    verify(mockedRouter.navigate(anything())).never();
  }));

  it('should display loading when getting PT projects', fakeAsync(() => {
    const env = new TestEnvironment({});
    env.setupProjectsAndResources([], []);
    env.fixture.detectChanges();

    expect(env.component.state).toEqual('loading');
    verify(mockedNoticeService.loadingStarted()).once();
    expect(env.projectSelect).toBeNull();
    expect(env.noProjectsMessage).toBeNull();
    expect(env.submitButton.nativeElement.disabled).toBe(true);

    tick();
    env.fixture.detectChanges();

    expect(env.component.state).toEqual('input');
    expect(env.connectProjectForm).not.toBeNull();
    verify(mockedNoticeService.loadingFinished()).once();
  }));

  it('should join when existing project is selected', fakeAsync(() => {
    const env = new TestEnvironment({
      incomingPTProjectId: TestEnvironment.notConnectedToUserButCanJoinOrCouldInitiatePTProjectId
    });
    const correspondingSFProjectId = 'project05';
    env.setupDefaultProjectData();
    env.waitForProjectsResponse();
    expect(env.component.state).toEqual('input');

    // The project is already in SF, so do not present settings to configure.
    expect(env.settingsCard).toBeNull();
    env.clickElement(env.submitButton);

    verify(mockedSFProjectService.onlineAddCurrentUser(correspondingSFProjectId)).once();
    verify(mockedRouter.navigate(deepEqual(['/projects', correspondingSFProjectId]))).once();
  }));

  it('not-accessible PT project id requested, shows error', fakeAsync(() => {
    // Suppose our application comes to this component with a PT project id that the user doesn't actually have access
    // to.
    const env = new TestEnvironment({ incomingPTProjectId: 'non-matching-pt-id' });
    env.setupDefaultProjectData();
    env.waitForProjectsResponse();
    expect(env.component.state).toEqual('input');

    // Show an error message.
    expect(env.messageNoSuchPTProject).not.toBeNull();
    // Don't let the user submit
    expect(env.submitButton.nativeElement.disabled).toBe(true);
  }));

  it('no PT project id was requested, shows error', fakeAsync(() => {
    // Suppose the user opens this component without a PT project id specified. Perhaps this happened because the user
    // came directly to the URL, or maybe our application made a mistake.
    const env = new TestEnvironment({ incomingPTProjectId: null });
    env.setupDefaultProjectData();
    env.waitForProjectsResponse();
    expect(env.component.state).toEqual('input');

    // Show an error message.
    expect(env.messageNoSuchPTProject).not.toBeNull();
    // Don't let the user submit
    expect(env.submitButton.nativeElement.disabled).toBe(true);
  }));

  it('not connectable or joinable PT project id requested, shows error', fakeAsync(() => {
    // Suppose the user gets here requesting a PT project id that they can not initiate an initial connection to, and
    // that they can not join. Perhaps our application made a mistake in getting here.
    const env = new TestEnvironment({
      incomingPTProjectId: TestEnvironment.notConnectedToUserAndCanNotInitiatePTProjectId
    });
    env.setupDefaultProjectData();
    env.waitForProjectsResponse();
    expect(env.component.state).toEqual('input');

    // Show an error message.
    expect(env.messageNoSuchPTProject).not.toBeNull();
    // Don't let the user submit
    expect(env.submitButton.nativeElement.disabled).toBe(true);
  }));

  it('not connectable but joinable PT project id requested. No error.', fakeAsync(() => {
    // The user can join the chosen project, but not initiate a connection to it. So it must already be on SF for them
    // to proceed.

    // TODO This doesn't seem to match how the template builds the project selector's items, or how the component
    // hasNonAdministratorProject was written. Revisit.

    const env = new TestEnvironment({
      incomingPTProjectId: TestEnvironment.notConnectedToUserAndCanNotInitiateButCanJoinPTProjectId
    });
    env.setupDefaultProjectData();
    env.waitForProjectsResponse();
    expect(env.component.state).toEqual('input');

    // Does not show the no-such-project error message.
    expect(env.messageNoSuchPTProject).toBeNull();
  }));

  it('connectable but not joinable PT project id requested. No error.', fakeAsync(() => {
    // The user can make an initial connection to the chosen project. But it is not yet on SF for there to be an
    // existing SF project to join.
    const env = new TestEnvironment({
      incomingPTProjectId: TestEnvironment.notConnectedToUserButCanInitiatePTProjectId
    });
    env.setupDefaultProjectData();
    env.waitForProjectsResponse();
    expect(env.component.state).toEqual('input');

    // Does not show the no-such-project error message.
    expect(env.messageNoSuchPTProject).toBeNull();
  }));

  it('user is already on an SF project with the requested PT project id - TODO worth handling?');

  it('should not display non-administrator message', fakeAsync(() => {
    const env = new TestEnvironment({});
    env.setupProjectsAndResources(
      [
        {
          paratextId: 'pt01',
          name: 'Target1',
          shortName: 'TA1',
          languageTag: 'en',
          isConnectable: true,
          isConnected: false
        },
        {
          paratextId: 'pt02',
          projectId: 'project02',
          name: 'Target2',
          shortName: 'TA2',
          languageTag: 'mri',
          isConnectable: false,
          isConnected: true
        },
        {
          paratextId: 'pt03',
          projectId: 'project03',
          name: 'Target3',
          shortName: 'TA3',
          languageTag: 'th',
          isConnectable: true,
          isConnected: true
        }
      ],
      []
    );
    env.waitForProjectsResponse();
    expect(env.component.state).toEqual('input');
    expect(env.getMenuItems(env.projectSelect).length).toEqual(3);
    expect(env.isMenuItemDisabled(env.projectSelect, 0)).toBe(false);
    expect(env.isMenuItemDisabled(env.projectSelect, 1)).toBe(true);
    expect(env.isMenuItemDisabled(env.projectSelect, 2)).toBe(false);
    expect(env.nonAdminMessage).toBeNull();
  }));

  it('disables page if offline', fakeAsync(() => {
    const env = new TestEnvironment({
      hasConnection: false,
      incomingPTProjectId: TestEnvironment.notConnectedToUserButCanJoinOrCouldInitiatePTProjectId
    });
    env.setupDefaultProjectData();
    env.fixture.detectChanges();
    expect(env.component.state).toEqual('offline');
    expect(env.offlineMessage).not.toBeNull();
    expect(env.noProjectsMessage).toBeNull();
    expect(env.component.connectProjectForm.disabled).toBe(true);
    expect(env.submitButton.nativeElement.disabled).toBe(true);

    env.onlineStatus = true;
    env.waitForProjectsResponse();
    expect(env.offlineMessage).toBeNull();
    expect(env.component.state).toEqual('input');
    // expect(env.getMenuItems(env.projectSelect).length).toEqual(4);
    expect(env.component.connectProjectForm.enabled).toBe(true);
    expect(env.submitButton.nativeElement.disabled).toBe(false);
    expect(env.nonAdminMessage).not.toBeNull();

    env.onlineStatus = false;
    env.waitForProjectsResponse();
    expect(env.nonAdminMessage).toBeNull();
    expect(env.component.state).toEqual('offline');
  }));

  it('should create when non-existent project is selected', fakeAsync(() => {
    const env = new TestEnvironment({});
    env.setupDefaultProjectData();
    env.waitForProjectsResponse();
    expect(env.component.state).toEqual('input');
    expect(env.translationSuggestionsCheckbox).toBeNull();

    env.changeSelectValue(env.projectSelect, 'pt01');

    env.clickElement(env.inputElement(env.checkingCheckbox));

    env.selectSourceProject('pt04');
    expect(env.component.connectProjectForm.valid).toBe(true);
    expect(env.translationSuggestionsCheckbox).not.toBeNull();

    env.clickElement(env.inputElement(env.translationSuggestionsCheckbox));
    expect(env.inputElement(env.translationSuggestionsCheckbox).checked).toBe(true);

    env.clickElement(env.submitButton);

    expect(env.component.state).toEqual('connecting');
    expect(env.submitButton).toBeNull();
    expect(env.progressBar).not.toBeNull();
    env.setQueuedCount();
    env.emitSyncComplete();

    const settings: SFProjectCreateSettings = {
      paratextId: 'pt01',
      checkingEnabled: false,
      translationSuggestionsEnabled: true,
      sourceParatextId: 'pt04'
    };
    verify(mockedSFProjectService.onlineCreate(deepEqual(settings))).once();
    verify(mockedRouter.navigate(deepEqual(['/projects', 'project01']))).once();
  }));

  it('should create when no setting is selected', fakeAsync(() => {
    const env = new TestEnvironment({});
    env.setupDefaultProjectData();
    env.waitForProjectsResponse();
    expect(env.component.state).toEqual('input');
    env.changeSelectValue(env.projectSelect, 'pt01');
    expect(env.translationSuggestionsCheckbox).toBeNull();
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
      translationSuggestionsEnabled: false,
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
    const env = new TestEnvironment({});
    env.setupDefaultProjectData();
    env.waitForProjectsResponse();
    expect(env.component.state).toEqual('input');
    env.changeSelectValue(env.projectSelect, 'pt01');
    expect(env.translationSuggestionsCheckbox).toBeNull();
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
    const env = new TestEnvironment({});
    env.setupDefaultProjectData();
    when(mockedParatextService.getResources()).thenReject(new Error('Failed to fetch resources'));
    env.waitForProjectsResponse();

    expect(env.component.state).toEqual('input');
    env.changeSelectValue(env.projectSelect, 'pt01');
    expect(env.translationSuggestionsCheckbox).toBeNull();

    expect(env.resourceLoadingErrorMessage.nativeElement.textContent).toContain('error fetching');

    env.selectSourceProject('pt04');
    expect(env.component.connectProjectForm.valid).toBe(true);
    expect(env.translationSuggestionsCheckbox).not.toBeNull();
    env.clickElement(env.submitButton);

    expect(env.component.state).toEqual('connecting');
    env.setQueuedCount();
    env.emitSyncComplete();

    const settings: SFProjectCreateSettings = {
      paratextId: 'pt01',
      checkingEnabled: true,
      translationSuggestionsEnabled: false,
      sourceParatextId: 'pt04'
    };
    verify(mockedSFProjectService.onlineCreate(deepEqual(settings))).once();
    verify(mockedRouter.navigate(deepEqual(['/projects', 'project01']))).once();
  }));

  it('knows what PT project id the prior page asked to connect to', fakeAsync(() => {
    const env = new TestEnvironment({});
    env.setupDefaultProjectData();
    env.waitForProjectsResponse();
    expect(env.component.state).toEqual('input');
    expect(env.component.incomingPTProjectId).toEqual(env.incomingPTProjectId);
    expect(env.component.paratextIdControl.value).toEqual(env.incomingPTProjectId);
  }));
});

class TestEnvironment {
  static readonly notConnectedToUserButCanInitiatePTProjectId: string = 'pt01';
  static readonly connectedToUserButCouldNotInitiatePTProjectId: string = 'pt02';
  static readonly notConnectedToUserAndCanNotInitiatePTProjectId: string = 'pt04';
  static readonly connectedToUserAndCouldInitiatePTProjectId: string = 'pt03';
  static readonly notConnectedToUserButCanJoinOrCouldInitiatePTProjectId: string = 'pt05';
  static readonly notConnectedToUserAndCanNotInitiateButCanJoinPTProjectId: string = 'pt06';
  readonly component: ConnectProjectComponent;
  readonly fixture: ComponentFixture<ConnectProjectComponent>;
  readonly testOnlineStatusService: TestOnlineStatusService = TestBed.inject(
    OnlineStatusService
  ) as TestOnlineStatusService;
  readonly incomingPTProjectId?: string;

  private readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

  constructor({
    hasConnection = true,
    incomingPTProjectId = TestEnvironment.notConnectedToUserButCanInitiatePTProjectId
  }: {
    hasConnection?: boolean;
    incomingPTProjectId?: string | null;
  }) {
    this.incomingPTProjectId = incomingPTProjectId ?? undefined;
    when(mockedRouter.getCurrentNavigation()).thenReturn({
      extras: { state: { ptProjectId: this.incomingPTProjectId } }
    } as any);
    when(mockedSFProjectService.onlineCreate(anything())).thenCall((settings: SFProjectCreateSettings) => {
      const newProject: SFProject = createTestProject({
        paratextId: settings.paratextId,
        translateConfig: {
          translationSuggestionsEnabled: settings.translationSuggestionsEnabled,
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
      this.realtimeService.create(SFProjectDoc.COLLECTION, 'project01', newProject);
      return Promise.resolve('project01');
    });
    when(mockedSFProjectService.get('project01')).thenCall(() =>
      this.realtimeService.subscribe(SFProjectDoc.COLLECTION, 'project01')
    );
    when(mockedSFProjectService.onlineAddCurrentUser('project01')).thenResolve();
    when(mockedUserService.currentUserId).thenReturn('user01');
    when(mockedI18nService.translateAndInsertTags(anything())).thenReturn('A translated string.');
    this.testOnlineStatusService.setIsOnline(hasConnection);
    this.fixture = TestBed.createComponent(ConnectProjectComponent);
    this.component = this.fixture.componentInstance;
  }

  get loginButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('#paratext-login-button'));
  }

  get projectSelect(): DebugElement {
    return this.fixture.debugElement.query(By.css('#project-select'));
  }

  get submitButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('#connect-submit-button'));
  }

  get connectProjectForm(): DebugElement {
    return this.fixture.debugElement.query(By.css('form'));
  }

  get noProjectsMessage(): DebugElement {
    return this.fixture.debugElement.query(By.css('#no-projects-msg'));
  }

  get nonAdminMessage(): DebugElement {
    return this.fixture.debugElement.query(By.css('#connect-non-admin-msg'));
  }

  get settingsCard(): DebugElement {
    return this.fixture.debugElement.query(By.css('#settings-card'));
  }

  get checkingCheckbox(): DebugElement {
    return this.fixture.debugElement.query(By.css('#checking-checkbox'));
  }

  get translationSuggestionsCheckbox(): DebugElement {
    return this.fixture.debugElement.query(By.css('#translation-suggestions-checkbox'));
  }

  get sourceProjectSelect(): DebugElement {
    return this.fixture.debugElement.query(By.css('app-project-select'));
  }

  get sourceParatextIdControl(): AbstractControl {
    return this.component.settings.controls.sourceParatextId;
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

  get messageNoSuchPTProject(): DebugElement {
    return this.getElement('#message-no-such-pt-proj');
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

  changeSelectValue(select: DebugElement, value: string): void {
    const matSelect: MatSelect = select.componentInstance;
    matSelect.value = value;
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

  getMenuItems(menu: DebugElement): DebugElement[] {
    const matSelect: MatSelect = menu.componentInstance;
    matSelect.open();
    this.waitForProjectsResponse();
    const options = menu.queryAll(By.css('mat-option'));
    matSelect.close();
    this.waitForProjectsResponse();
    return options;
  }

  isMenuItemDisabled(menu: DebugElement, index: number): boolean {
    return this.getMenuItems(menu)[index].nativeElement.classList.contains('mdc-list-item--disabled');
  }

  getMenuItemText(menu: DebugElement, index: number): string {
    return this.getMenuItems(menu)[index].nativeElement.textContent.trim();
  }

  inputElement(element: DebugElement): HTMLInputElement {
    return element.nativeElement.querySelector('input') as HTMLInputElement;
  }

  setQueuedCount(): void {
    const projectDoc = this.realtimeService.get<SFProjectDoc>(SFProjectDoc.COLLECTION, 'project01');
    projectDoc.submitJson0Op(op => op.set<number>(p => p.sync.queuedCount, 1), false);
    tick();
    this.fixture.detectChanges();
  }

  emitSyncComplete(): void {
    const projectDoc = this.realtimeService.get<SFProjectDoc>(SFProjectDoc.COLLECTION, 'project01');
    projectDoc.submitJson0Op(op => {
      op.set<number>(p => p.sync.queuedCount, 0);
      op.set<boolean>(p => p.sync.lastSyncSuccessful!, true);
      op.set(p => p.sync.dateLastSuccessfulSync!, new Date().toJSON());
    }, false);
    this.fixture.detectChanges();
  }

  setupProjectsAndResources(projects?: ParatextProject[], resources?: SelectableProject[]): void {
    projects?.forEach((paratextProject: ParatextProject) => {
      when(
        mockedParatextService.isParatextProjectInSF(objectContaining({ paratextId: paratextProject.paratextId }))
      ).thenReturn(paratextProject.projectId != null);
    });
    when(mockedParatextService.getProjects()).thenResolve(projects);
    when(mockedParatextService.getResources()).thenResolve(resources);
  }

  setupDefaultProjectData(): void {
    this.setupProjectsAndResources(
      [
        {
          paratextId: TestEnvironment.notConnectedToUserButCanInitiatePTProjectId,
          name: 'English',
          shortName: 'ENG',
          languageTag: 'en',
          // The user does not have access to a corresponding SF project (whether there is one or not), and has
          // permission to do an initial connection to the PT project. Because projectId is undefined, we know there is
          // no SF project.
          isConnectable: true,
          isConnected: false
        },
        {
          paratextId: TestEnvironment.notConnectedToUserButCanJoinOrCouldInitiatePTProjectId,
          projectId: 'project05',
          name: 'English2',
          shortName: 'ENG2',
          languageTag: 'en',
          // The user does not have access to a corresponding SF project (whether there is one or not), and has
          // permission to do an initial connection to the PT project. Because projectId is defined, we know there is a
          // corresponding SF project.
          isConnectable: true,
          isConnected: false
        },
        {
          paratextId: TestEnvironment.connectedToUserButCouldNotInitiatePTProjectId,
          projectId: 'project02',
          name: 'Maori',
          shortName: 'MRI',
          languageTag: 'mri',
          // The user has access to both the PT project and corresponding SF project. But the user does not have
          // permission to do an initial connection to the PT project.
          isConnectable: false,
          isConnected: true
        },
        {
          paratextId: TestEnvironment.notConnectedToUserAndCanNotInitiatePTProjectId,
          name: 'Spanish',
          shortName: 'ESP',
          languageTag: 'es',
          // The project may or may not be on SF yet. The user might not have access to the PT project, or might not
          // have permission to do an initial connection to the PT project. Because projectId is undefined, we know
          // there is no SF project.
          isConnectable: false,
          isConnected: false
        },
        {
          paratextId: TestEnvironment.notConnectedToUserAndCanNotInitiateButCanJoinPTProjectId,
          projectId: 'project06',
          name: 'Spanish',
          shortName: 'ESP',
          languageTag: 'es',
          // The project may or may not be on SF yet. The user might not have access to the PT project, or might not
          // have permission to do an initial connection to the PT project. Because projectId is defined, we know there
          // is a corresponding SF project. An example situation might be that a user is a PT Translator on the PT
          // project, is not on the corresponding SF project, and can not do an initial PT to SF connection. The user
          // can still _join_ the project, thus "connecting" it to their user account, even though !isConnectable.
          isConnectable: false,
          isConnected: false
        },
        {
          paratextId: TestEnvironment.connectedToUserAndCouldInitiatePTProjectId,
          projectId: 'project03',
          name: 'Thai',
          shortName: 'THA',
          languageTag: 'th',
          // SF has an initial connection to the PT project, and the user has access to both the SF and PT projects. The
          // user has permission to do an initial connection to the PT project.
          isConnectable: true,
          isConnected: true
        }
      ],
      [
        { paratextId: 'e01f11e9b4b8e338', name: 'Sob Jonah and Luke', shortName: 'SJL' },
        {
          paratextId: '5e51f89e89947acb',
          name: 'Aruamu New Testament [msy] Papua New Guinea 2004 DBL',
          shortName: 'ANT'
        },
        { paratextId: '9bb76cd3e5a7f9b4', name: 'Revised Version with Apocrypha 1885, 1895', shortName: 'RVA' }
      ]
    );
  }

  waitForProjectsResponse(): void {
    tick();
    this.fixture.detectChanges();
    tick();
    this.fixture.detectChanges();
  }

  private getElement(query: string): DebugElement {
    return this.fixture.debugElement.query(By.css(query));
  }
}
