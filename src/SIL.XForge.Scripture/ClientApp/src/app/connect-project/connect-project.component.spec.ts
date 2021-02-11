import { MdcSelect } from '@angular-mdc/web/select';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { DebugElement, ErrorHandler } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { AbstractControl } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { CheckingShareLevel } from 'realtime-server/lib/scriptureforge/models/checking-config';
import { SFProject } from 'realtime-server/lib/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/scriptureforge/models/sf-project-role';
import { BehaviorSubject } from 'rxjs';
import { anything, deepEqual, mock, resetCalls, verify, when } from 'ts-mockito';
import { CommandError, CommandErrorCode } from 'xforge-common/command.service';
import { I18nService } from 'xforge-common/i18n.service';
import { NoticeService } from 'xforge-common/notice.service';
import { PwaService } from 'xforge-common/pwa.service';
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
import { SFProjectService } from '../core/sf-project.service';
import { ProjectSelectComponent } from '../project-select/project-select.component';
import { SyncProgressComponent } from '../sync/sync-progress/sync-progress.component';
import { ConnectProjectComponent } from './connect-project.component';

const mockedParatextService = mock(ParatextService);
const mockedRouter = mock(Router);
const mockedSFProjectService = mock(SFProjectService);
const mockedUserService = mock(UserService);
const mockedNoticeService = mock(NoticeService);
const mockedI18nService = mock(I18nService);
const mockedPwaService = mock(PwaService);
const mockedErrorHandler = mock(ErrorHandler);

describe('ConnectProjectComponent', () => {
  configureTestingModule(() => ({
    imports: [
      HttpClientTestingModule,
      NoopAnimationsModule,
      UICommonModule,
      TestTranslocoModule,
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)
    ],
    declarations: [ConnectProjectComponent, ProjectSelectComponent, SyncProgressComponent],
    providers: [
      { provide: ParatextService, useMock: mockedParatextService },
      { provide: Router, useMock: mockedRouter },
      { provide: SFProjectService, useMock: mockedSFProjectService },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: I18nService, useMock: mockedI18nService },
      { provide: ErrorHandler, useMock: mockedErrorHandler },
      { provide: PwaService, useMock: mockedPwaService }
    ]
  }));

  it('should display login button when PT projects is null', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedParatextService.getProjectsAndResources()).thenReturn(Promise.resolve([undefined, undefined]));
    env.waitForProjectsResponse();

    expect(env.component.state).toEqual('login');
    expect(env.loginButton).not.toBeNull();
    expect(env.loginButton.nativeElement.disabled).toBe(false);
    env.onlineStatus = false;
    expect(env.loginButton).toBeNull();
  }));

  it('should display form when PT projects is empty', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedParatextService.getProjectsAndResources()).thenReturn(Promise.resolve([[], []]));
    env.waitForProjectsResponse();
    expect(env.component.state).toEqual('input');
    expect(env.connectProjectForm).not.toBeNull();
    expect(env.projectSelect).toBeNull();
    expect(env.noProjectsMessage.nativeElement.textContent).toBe('A translated string.');
  }));

  it('should display projects then resources', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupDefaultProjectData();
    env.waitForProjectsResponse();
    expect(env.component.state).toEqual('input');
    expect(env.connectProjectForm).not.toBeNull();

    env.changeSelectValue(env.projectSelect, 'pt01');

    env.clickElement(env.inputElement(env.checkingCheckbox));

    env.clickElement(env.inputElement(env.translationSuggestionsCheckbox));
    expect(env.sourceParatextIdControl.valid).toBe(true);
    expect(env.sourceParatextIdControl.disabled).toBe(false);
    env.openSourceProjectAutocomplete();
    // NOTE: The source projects list excludes pt01 (as it is our selected project above)
    expect(env.selectableSourceProjectsAndResources.projects.length).toEqual(3);
    expect(env.selectableSourceProjectsAndResources.resources.length).toEqual(3);
    expect(env.selectableSourceProjectsAndResources.projects[2]).toBe('Thai');
    expect(env.selectableSourceProjectsAndResources.resources[0]).toBe('Sob Jonah and Luke');
    expect(env.component.connectProjectForm.valid).toBe(true);
  }));

  it('should do nothing when form is invalid', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedParatextService.getProjectsAndResources()).thenReturn(Promise.resolve([[], []]));
    env.waitForProjectsResponse();

    expect(env.submitButton.nativeElement.disabled).toBe(true);
    env.clickElement(env.submitButton);

    verify(mockedSFProjectService.onlineCreate(anything())).never();
    verify(mockedSFProjectService.onlineAddCurrentUser(anything(), anything())).never();
    verify(mockedRouter.navigate(anything())).never();
  }));

  it('should display loading when getting PT projects', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedParatextService.getProjectsAndResources()).thenReturn(Promise.resolve([[], []]));
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
    const env = new TestEnvironment();
    env.setupDefaultProjectData();
    env.waitForProjectsResponse();
    expect(env.component.state).toEqual('input');

    // Simulate touching the control
    env.component.paratextIdControl.markAsTouched();
    expect(env.component.paratextIdControl.valid).toBe(true);
    env.clickElement(env.submitButton);
    expect(env.component.paratextIdControl.errors!.required).toBe(true);

    env.changeSelectValue(env.projectSelect, 'pt03');

    expect(env.settingsCard).toBeNull();
    env.clickElement(env.submitButton);

    verify(mockedSFProjectService.onlineAddCurrentUser('project03')).once();
    verify(mockedRouter.navigate(deepEqual(['/projects', 'project03']))).once();
  }));

  it('should display non-connectable projects disabled', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupDefaultProjectData();
    env.waitForProjectsResponse();
    expect(env.component.state).toEqual('input');
    expect(env.getMenuItems(env.projectSelect).length).toEqual(4);
    expect(env.isMenuItemDisabled(env.projectSelect, 0)).toBe(false);
    expect(env.isMenuItemDisabled(env.projectSelect, 1)).toBe(true);
    expect(env.isMenuItemDisabled(env.projectSelect, 2)).toBe(true);
    expect(env.isMenuItemDisabled(env.projectSelect, 3)).toBe(false);
    expect(env.nonAdminMessage).not.toBeNull();
  }));

  it('should not display non-administrator message', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedParatextService.getProjectsAndResources()).thenReturn(
      Promise.resolve([
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
      ])
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
    const env = new TestEnvironment(false);
    env.setupDefaultProjectData();
    env.fixture.detectChanges();
    expect(env.component.state).toEqual('offline');
    expect(env.offlineMessage).not.toBeNull();
    expect(env.noProjectsMessage).toBeNull();
    expect(env.component.connectProjectForm.disabled).toBe(true);
    expect(env.submitButton.nativeElement.disabled).toBe(true);

    env.onlineStatus = true;
    expect(env.offlineMessage).toBeNull();
    expect(env.component.state).toEqual('input');
    expect(env.getMenuItems(env.projectSelect).length).toEqual(4);
    expect(env.component.connectProjectForm.enabled).toBe(true);
    expect(env.submitButton.nativeElement.disabled).toBe(false);
    expect(env.nonAdminMessage).not.toBeNull();

    env.onlineStatus = false;
    expect(env.nonAdminMessage).toBeNull();
    expect(env.component.state).toEqual('offline');
  }));

  it('submit if user selects a source project then disables translation suggestions', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupDefaultProjectData();
    env.waitForProjectsResponse();

    env.changeSelectValue(env.projectSelect, 'pt01');
    env.clickElement(env.inputElement(env.translationSuggestionsCheckbox));

    // Simulate touching source project control
    env.component.settings.controls.sourceParatextId.markAsTouched();
    expect(env.component.settings.controls.sourceParatextId.valid).toBe(true);
    env.clickElement(env.submitButton);
    expect(env.component.settings.controls.sourceParatextId.errors!['required']).toBe(true);
    // Uncheck the translation suggestions checkbox
    env.clickElement(env.inputElement(env.translationSuggestionsCheckbox));
    env.clickElement(env.submitButton);
    env.emitSyncComplete();
    const settings: SFProjectCreateSettings = {
      paratextId: 'pt01',
      checkingEnabled: true,
      translationSuggestionsEnabled: false,
      sourceParatextId: undefined
    };
    verify(mockedSFProjectService.onlineCreate(deepEqual(settings))).once();
    verify(mockedRouter.navigate(deepEqual(['/projects', 'project01']))).once();
  }));

  it('should create when non-existent project is selected', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupDefaultProjectData();
    env.waitForProjectsResponse();
    expect(env.component.state).toEqual('input');

    env.changeSelectValue(env.projectSelect, 'pt01');

    env.clickElement(env.inputElement(env.checkingCheckbox));

    env.clickElement(env.inputElement(env.translationSuggestionsCheckbox));
    expect(env.sourceParatextIdControl.valid).toBe(true);
    expect(env.sourceParatextIdControl.disabled).toBe(false);

    env.selectSourceProject('pt04');
    expect(env.component.connectProjectForm.valid).toBe(true);
    env.submitButton.nativeElement.click();
    env.fixture.detectChanges();
    expect(env.submitButton.nativeElement.disabled).toBe(true);
    tick();
    env.fixture.detectChanges();

    expect(env.component.state).toEqual('connecting');
    expect(env.progressBar).not.toBeNull();
    env.emitSyncProgress(1);
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
    const env = new TestEnvironment();
    env.setupDefaultProjectData();
    env.waitForProjectsResponse();
    expect(env.component.state).toEqual('input');
    env.changeSelectValue(env.projectSelect, 'pt01');
    expect(env.inputElement(env.translationSuggestionsCheckbox).checked).toBe(false);
    expect(env.inputElement(env.checkingCheckbox).checked).toBe(true);

    env.clickElement(env.submitButton);
    tick();

    expect(env.component.state).toEqual('connecting');
    expect(env.progressBar).not.toBeNull();
    env.emitSyncProgress(1);
    env.emitSyncComplete();

    const project: SFProjectCreateSettings = {
      paratextId: 'pt01',
      checkingEnabled: true,
      translationSuggestionsEnabled: false,
      sourceParatextId: undefined
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
    env.changeSelectValue(env.projectSelect, 'pt01');
    expect(env.inputElement(env.translationSuggestionsCheckbox).checked).toBe(false);
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

    verify(mockedParatextService.getProjectsAndResources()).once();
    verify(mockedErrorHandler.handleError(anything())).once();
    expect(env.component.state).toEqual('input');
    expect(env.progressBar).toBeNull();
    verify(mockedSFProjectService.onlineCreate(anything())).once();
    verify(mockedSFProjectService.onlineAddCurrentUser(anything())).never();
    verify(mockedRouter.navigate(deepEqual(['/projects', 'project01']))).never();
  }));
});

class TestEnvironment {
  readonly component: ConnectProjectComponent;
  readonly fixture: ComponentFixture<ConnectProjectComponent>;

  private readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);
  private isOnline: BehaviorSubject<boolean>;

  constructor(hasConnection: boolean = true) {
    when(mockedSFProjectService.onlineCreate(anything())).thenCall((settings: SFProjectCreateSettings) => {
      const newProject: SFProject = {
        name: 'project 01',
        shortName: 'P01',
        paratextId: settings.paratextId,
        writingSystem: { tag: 'qaa' },
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
          checkingEnabled: settings.checkingEnabled,
          shareEnabled: false,
          shareLevel: CheckingShareLevel.Specific,
          usersSeeEachOthersResponses: true
        },
        sync: { queuedCount: 1 },
        texts: [],
        userRoles: {
          user01: SFProjectRole.ParatextAdministrator
        }
      };
      this.realtimeService.create(SFProjectDoc.COLLECTION, 'project01', newProject);
      return Promise.resolve('project01');
    });
    when(mockedSFProjectService.get('project01')).thenCall(() =>
      this.realtimeService.subscribe(SFProjectDoc.COLLECTION, 'project01')
    );
    when(mockedSFProjectService.onlineAddCurrentUser('project01')).thenResolve();
    when(mockedUserService.currentUserId).thenReturn('user01');
    when(mockedI18nService.translateAndInsertTags(anything())).thenReturn('A translated string.');
    this.isOnline = new BehaviorSubject<boolean>(hasConnection);
    when(mockedPwaService.onlineStatus).thenReturn(this.isOnline.asObservable());
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

  get projectsMenu(): DebugElement {
    return this.fixture.debugElement.query(By.css('#projects-menu'));
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
    this.isOnline.next(hasConnection);
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

  selectSourceProject(projectId: string) {
    this.sourceProjectSelectComponent.value = projectId;
    this.fixture.detectChanges();
    tick();
  }

  openSourceProjectAutocomplete() {
    this.sourceProjectSelectComponent.autocompleteTrigger.openPanel();
    this.fixture.detectChanges();
    tick();
  }

  changeSelectValue(select: DebugElement, value: string): void {
    const mdcSelect: MdcSelect = select.componentInstance;
    mdcSelect.value = value;
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
    return menu.queryAll(By.css('mdc-list-item'));
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

  emitSyncProgress(percentCompleted: number): void {
    const projectDoc = this.realtimeService.get<SFProjectDoc>(SFProjectDoc.COLLECTION, 'project01');
    projectDoc.submitJson0Op(op => op.set<number>(p => p.sync.percentCompleted!, percentCompleted), false);
    tick();
    this.fixture.detectChanges();
  }

  emitSyncComplete(): void {
    const projectDoc = this.realtimeService.get<SFProjectDoc>(SFProjectDoc.COLLECTION, 'project01');
    projectDoc.submitJson0Op(op => {
      op.set<number>(p => p.sync.queuedCount, 0);
      op.unset(p => p.sync.percentCompleted!);
      op.set<boolean>(p => p.sync.lastSyncSuccessful!, true);
      op.set(p => p.sync.dateLastSuccessfulSync!, new Date().toJSON());
    }, false);
    this.fixture.detectChanges();
  }

  setupDefaultProjectData(): void {
    when(mockedParatextService.getProjectsAndResources()).thenReturn(
      Promise.resolve<[ParatextProject[], SelectableProject[]]>([
        [
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
        ],
        [
          { paratextId: 'e01f11e9b4b8e338', name: 'Sob Jonah and Luke' },
          { paratextId: '5e51f89e89947acb', name: 'Aruamu New Testament [msy] Papua New Guinea 2004 DBL' },
          { paratextId: '9bb76cd3e5a7f9b4', name: 'Revised Version with Apocrypha 1885, 1895' }
        ]
      ])
    );
  }

  waitForProjectsResponse(): void {
    tick();
    this.fixture.detectChanges();
    tick();
    this.fixture.detectChanges();
  }
}
