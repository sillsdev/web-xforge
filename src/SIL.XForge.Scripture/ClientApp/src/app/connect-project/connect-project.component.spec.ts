import { MdcSelect } from '@angular-mdc/web';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { DebugElement } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { AbstractControl } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { CheckingShareLevel } from 'realtime-server/lib/scriptureforge/models/checking-config';
import { SFProject } from 'realtime-server/lib/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/scriptureforge/models/sf-project-role';
import { defer, of } from 'rxjs';
import { anything, deepEqual, instance, mock, verify, when } from 'ts-mockito';
import { NoticeService } from 'xforge-common/notice.service';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { ParatextProject } from '../core/models/paratext-project';
import { SFProjectCreateSettings } from '../core/models/sf-project-create-settings';
import { SFProjectDoc } from '../core/models/sf-project-doc';
import { SF_REALTIME_DOC_TYPES } from '../core/models/sf-realtime-doc-types';
import { ParatextService } from '../core/paratext.service';
import { SFProjectService } from '../core/sf-project.service';
import { ConnectProjectComponent } from './connect-project.component';

describe('ConnectProjectComponent', () => {
  it('should display login button when PT projects is null', () => {
    const env = new TestEnvironment();
    when(env.mockedParatextService.getProjects()).thenReturn(of(null));
    env.fixture.detectChanges();

    expect(env.component.state).toEqual('login');
    expect(env.loginButton).not.toBeNull();
  });

  it('should display form when PT projects is empty', fakeAsync(() => {
    const env = new TestEnvironment();
    when(env.mockedParatextService.getProjects()).thenReturn(of([]));
    env.fixture.detectChanges();
    expect(env.component.state).toEqual('input');
    expect(env.connectProjectForm).not.toBeNull();
    expect(env.projectSelect).toBeNull();
    expect(env.noProjectsMessage.nativeElement.textContent).toContain(
      'Looks like there are no connectable projects for you.'
    );
  }));

  it('should do nothing when form is invalid', fakeAsync(() => {
    const env = new TestEnvironment();
    when(env.mockedParatextService.getProjects()).thenReturn(of([]));
    env.fixture.detectChanges();

    expect(env.submitButton.nativeElement.disabled).toBe(true);
    env.clickElement(env.submitButton);

    verify(env.mockedSFProjectService.onlineCreate(anything())).never();
    verify(env.mockedSFProjectService.onlineAddCurrentUser(anything(), anything())).never();
    verify(env.mockedRouter.navigate(anything())).never();
  }));

  it('should display loading when getting PT projects', fakeAsync(() => {
    const env = new TestEnvironment();
    when(env.mockedParatextService.getProjects()).thenReturn(defer(() => Promise.resolve([])));
    env.fixture.detectChanges();

    expect(env.component.state).toEqual('loading');
    verify(env.mockedNoticeService.loadingStarted()).once();
    expect(env.projectSelect).toBeNull();
    expect(env.noProjectsMessage).toBeNull();
    expect(env.submitButton.nativeElement.disabled).toBe(true);

    tick();
    env.fixture.detectChanges();

    expect(env.component.state).toEqual('input');
    expect(env.connectProjectForm).not.toBeNull();
    verify(env.mockedNoticeService.loadingFinished()).once();
  }));

  it('should join when existing project is selected', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupDefaultProjectData();
    env.fixture.detectChanges();
    expect(env.component.state).toEqual('input');

    // Simulate touching the control
    env.component.paratextIdControl.markAsTouched();
    expect(env.component.paratextIdControl.valid).toBe(true);
    env.clickElement(env.submitButton);
    expect(env.component.paratextIdControl.errors['required']).toBe(true);

    env.changeSelectValue(env.projectSelect, 'pt03');

    expect(env.settingsCard).toBeNull();
    env.clickElement(env.submitButton);

    verify(env.mockedSFProjectService.onlineAddCurrentUser('project03')).once();
    verify(env.mockedRouter.navigate(deepEqual(['/projects', 'project03']))).once();
  }));

  it('should display non-connectable projects disabled', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupDefaultProjectData();
    env.fixture.detectChanges();
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
    when(env.mockedParatextService.getProjects()).thenReturn(
      of<ParatextProject[]>([
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
      ])
    );
    env.fixture.detectChanges();
    expect(env.component.state).toEqual('input');
    expect(env.getMenuItems(env.projectSelect).length).toEqual(3);
    expect(env.isMenuItemDisabled(env.projectSelect, 0)).toBe(false);
    expect(env.isMenuItemDisabled(env.projectSelect, 1)).toBe(true);
    expect(env.isMenuItemDisabled(env.projectSelect, 2)).toBe(false);
    expect(env.nonAdminMessage).toBeNull();
  }));

  it('submit if user selects a source project then disables translation suggestions', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupDefaultProjectData();
    env.fixture.detectChanges();

    env.changeSelectValue(env.projectSelect, 'pt01');
    env.clickElement(env.inputElement(env.translationSuggestionsCheckbox));

    // Simulate touching source project control
    env.component.sourceParatextIdControl.markAsTouched();
    expect(env.component.sourceParatextIdControl.valid).toBe(true);
    env.clickElement(env.submitButton);
    expect(env.component.sourceParatextIdControl.errors['required']).toBe(true);
    // Uncheck the translation suggestions checkbox
    env.clickElement(env.inputElement(env.translationSuggestionsCheckbox));
    env.clickElement(env.submitButton);
    env.emitSyncComplete();
    const settings: SFProjectCreateSettings = {
      paratextId: 'pt01',
      checkingEnabled: false,
      translationSuggestionsEnabled: false,
      sourceParatextId: undefined
    };
    verify(env.mockedSFProjectService.onlineCreate(deepEqual(settings))).once();
    verify(env.mockedRouter.navigate(deepEqual(['/projects', 'project01']))).once();
  }));

  it('should create when non-existent project is selected', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupDefaultProjectData();
    env.fixture.detectChanges();
    expect(env.component.state).toEqual('input');

    env.changeSelectValue(env.projectSelect, 'pt01');

    env.clickElement(env.inputElement(env.checkingCheckbox));

    env.clickElement(env.inputElement(env.translationSuggestionsCheckbox));
    expect(env.sourceParatextIdControl.valid).toBe(true);
    expect(env.sourceParatextIdControl.disabled).toBe(false);

    env.changeSelectValue(env.sourceProjectSelect, 'pt04');
    expect(env.component.connectProjectForm.valid).toBe(true);
    env.clickElement(env.submitButton);
    tick();

    expect(env.component.state).toEqual('connecting');
    expect(env.progressBar).toBeDefined();
    expect(env.component.connectPending).toEqual(true);

    env.emitSyncProgress(0);
    expect(env.component.connectPending).toEqual(false);
    env.emitSyncProgress(0.5);
    env.emitSyncProgress(1);
    env.emitSyncComplete();

    const settings: SFProjectCreateSettings = {
      paratextId: 'pt01',
      checkingEnabled: true,
      translationSuggestionsEnabled: true,
      sourceParatextId: 'pt04'
    };
    verify(env.mockedSFProjectService.onlineCreate(deepEqual(settings))).once();
    verify(env.mockedRouter.navigate(deepEqual(['/projects', 'project01']))).once();
  }));

  it('should create when no setting is selected', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupDefaultProjectData();
    env.fixture.detectChanges();
    expect(env.component.state).toEqual('input');
    env.changeSelectValue(env.projectSelect, 'pt01');
    expect(env.inputElement(env.translationSuggestionsCheckbox).checked).toBe(false);
    expect(env.inputElement(env.checkingCheckbox).checked).toBe(false);

    env.clickElement(env.submitButton);
    tick();

    expect(env.component.state).toEqual('connecting');
    expect(env.progressBar).toBeDefined();
    expect(env.component.connectPending).toEqual(true);

    env.emitSyncProgress(0);
    expect(env.component.connectPending).toEqual(false);
    env.emitSyncProgress(0.5);
    env.emitSyncProgress(1);
    env.emitSyncComplete();

    const project: SFProjectCreateSettings = {
      paratextId: 'pt01',
      checkingEnabled: false,
      translationSuggestionsEnabled: false,
      sourceParatextId: undefined
    };
    verify(env.mockedSFProjectService.onlineCreate(deepEqual(project))).once();
    verify(env.mockedRouter.navigate(deepEqual(['/projects', 'project01']))).once();
  }));
});

class TestEnvironment {
  readonly component: ConnectProjectComponent;
  readonly fixture: ComponentFixture<ConnectProjectComponent>;

  readonly mockedParatextService = mock(ParatextService);
  readonly mockedRouter = mock(Router);
  readonly mockedSFProjectService = mock(SFProjectService);
  readonly mockedUserService = mock(UserService);
  readonly mockedNoticeService = mock(NoticeService);

  private readonly realtimeService = new TestRealtimeService(SF_REALTIME_DOC_TYPES);

  constructor() {
    when(this.mockedSFProjectService.onlineCreate(anything())).thenCall((settings: SFProjectCreateSettings) => {
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
                  name: 'Source',
                  shortName: 'SRC',
                  writingSystem: { tag: 'qaa' }
                }
        },
        checkingConfig: {
          checkingEnabled: settings.checkingEnabled,
          shareEnabled: true,
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
    when(this.mockedSFProjectService.get('project01')).thenCall(() =>
      this.realtimeService.subscribe(SFProjectDoc.COLLECTION, 'project01')
    );
    when(this.mockedSFProjectService.onlineAddCurrentUser('project01')).thenResolve();
    when(this.mockedUserService.currentUserId).thenReturn('user01');

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, NoopAnimationsModule, UICommonModule],
      declarations: [ConnectProjectComponent],
      providers: [
        { provide: ParatextService, useFactory: () => instance(this.mockedParatextService) },
        { provide: Router, useFactory: () => instance(this.mockedRouter) },
        { provide: SFProjectService, useFactory: () => instance(this.mockedSFProjectService) },
        { provide: UserService, useFactory: () => instance(this.mockedUserService) },
        { provide: NoticeService, useFactory: () => instance(this.mockedNoticeService) }
      ]
    });
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
    return this.fixture.debugElement.query(By.css('#based-on-select'));
  }

  get sourceParatextIdControl(): AbstractControl {
    return this.component.connectProjectForm.get('settings.sourceParatextId');
  }

  get progressBar(): DebugElement {
    return this.fixture.debugElement.query(By.css('mdc-linear-progress'));
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
    projectDoc.submitJson0Op(op => op.set<number>(p => p.sync.percentCompleted, percentCompleted), false);
    tick();
    this.fixture.detectChanges();
  }

  emitSyncComplete(): void {
    const projectDoc = this.realtimeService.get<SFProjectDoc>(SFProjectDoc.COLLECTION, 'project01');
    projectDoc.submitJson0Op(op => {
      op.set<number>(p => p.sync.queuedCount, 0);
      op.unset(p => p.sync.percentCompleted);
      op.set<boolean>(p => p.sync.lastSyncSuccessful, true);
      op.set(p => p.sync.dateLastSuccessfulSync, new Date().toJSON());
    }, false);
    this.fixture.detectChanges();
  }

  setupDefaultProjectData(): void {
    when(this.mockedParatextService.getProjects()).thenReturn(
      of<ParatextProject[]>([
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
      ])
    );
  }
}
