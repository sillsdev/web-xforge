import { MdcSelect } from '@angular-mdc/web';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { DebugElement } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { AbstractControl } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import cloneDeep from 'lodash/cloneDeep';
import * as OTJson0 from 'ot-json0';
import { SFProject } from 'realtime-server/lib/scriptureforge/models/sf-project';
import { defer, of } from 'rxjs';
import { anything, deepEqual, instance, mock, verify, when } from 'ts-mockito';
import { ParatextProject } from 'xforge-common/models/paratext-project';
import { NoticeService } from 'xforge-common/notice.service';
import { ParatextService } from 'xforge-common/paratext.service';
import { MemoryRealtimeDocAdapter } from 'xforge-common/realtime-doc-adapter';
import { RealtimeOfflineStore } from 'xforge-common/realtime-offline-store';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { SFProjectDoc } from '../core/models/sf-project-doc';
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
    when(env.mockedParatextService.getProjects()).thenReturn(
      of<ParatextProject[]>([
        {
          paratextId: 'pt01',
          name: 'Target',
          languageTag: 'en',
          languageName: 'English',
          projectId: 'project01',
          isConnectable: true,
          isConnected: false
        }
      ])
    );
    env.fixture.detectChanges();
    expect(env.component.state).toEqual('input');

    env.changeSelectValue(env.projectSelect, 'pt01');

    expect(env.settingsCard).toBeNull();

    env.clickElement(env.submitButton);

    verify(env.mockedSFProjectService.onlineAddCurrentUser('project01')).once();
    verify(env.mockedRouter.navigate(deepEqual(['/projects', 'project01']))).once();
  }));

  it('should display projects sorted', fakeAsync(() => {
    const env = new TestEnvironment();
    when(env.mockedParatextService.getProjects()).thenReturn(
      of<ParatextProject[]>([
        {
          paratextId: 'pt02',
          name: 'Maori',
          languageTag: 'mri',
          languageName: 'Maori',
          isConnectable: false,
          isConnected: true
        },
        {
          paratextId: 'pt03',
          name: 'Thai',
          languageTag: 'th',
          languageName: 'Thai',
          isConnectable: true,
          isConnected: true
        },
        {
          paratextId: 'pt04',
          name: 'Spanish',
          languageTag: 'es',
          languageName: 'Spanish',
          isConnectable: false,
          isConnected: false
        },
        {
          paratextId: 'pt01',
          name: 'English',
          languageTag: 'en',
          languageName: 'English',
          isConnectable: true,
          isConnected: false
        }
      ])
    );
    env.fixture.detectChanges();
    expect(env.component.state).toEqual('input');
    expect(env.getMenuItems(env.projectSelect).length).toEqual(4);
    expect(env.getMenuItemText(env.projectSelect, 0)).toContain('English');
    expect(env.getMenuItemText(env.projectSelect, 1)).toContain('Maori');
    expect(env.getMenuItemText(env.projectSelect, 2)).toContain('Spanish');
    expect(env.getMenuItemText(env.projectSelect, 3)).toContain('Thai');
  }));

  it('should display non-connectable projects disabled', fakeAsync(() => {
    const env = new TestEnvironment();
    when(env.mockedParatextService.getProjects()).thenReturn(
      of<ParatextProject[]>([
        {
          paratextId: 'pt04',
          name: 'Source',
          languageTag: 'es',
          languageName: 'Spanish',
          isConnectable: false,
          isConnected: false
        },
        {
          paratextId: 'pt01',
          name: 'Target1',
          languageTag: 'en',
          languageName: 'English',
          isConnectable: true,
          isConnected: false
        },
        {
          paratextId: 'pt02',
          name: 'Target2',
          languageTag: 'mri',
          languageName: 'Maori',
          isConnectable: false,
          isConnected: true
        },
        {
          paratextId: 'pt03',
          name: 'Target3',
          languageTag: 'th',
          languageName: 'Thai',
          isConnectable: true,
          isConnected: true
        }
      ])
    );
    env.fixture.detectChanges();
    expect(env.component.state).toEqual('input');
    expect(env.getMenuItems(env.projectSelect).length).toEqual(4);
    expect(env.isMenuItemDisabled(env.projectSelect, 0)).toBe(true);
    expect(env.isMenuItemDisabled(env.projectSelect, 1)).toBe(false);
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
          languageTag: 'en',
          languageName: 'English',
          isConnectable: true,
          isConnected: false
        },
        {
          paratextId: 'pt02',
          name: 'Target2',
          languageTag: 'mri',
          languageName: 'Maori',
          isConnectable: false,
          isConnected: true
        },
        {
          paratextId: 'pt03',
          name: 'Target3',
          languageTag: 'th',
          languageName: 'Thai',
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

  it('should display source projects sorted', fakeAsync(() => {
    const env = new TestEnvironment();
    when(env.mockedParatextService.getProjects()).thenReturn(
      of<ParatextProject[]>([
        {
          paratextId: 'pt02',
          name: 'Maori',
          languageTag: 'mri',
          languageName: 'Maori',
          isConnectable: false,
          isConnected: true
        },
        {
          paratextId: 'pt03',
          name: 'Thai',
          languageTag: 'th',
          languageName: 'Thai',
          isConnectable: true,
          isConnected: true
        },
        {
          paratextId: 'pt04',
          name: 'Spanish',
          languageTag: 'es',
          languageName: 'Spanish',
          isConnectable: false,
          isConnected: false
        },
        {
          paratextId: 'pt01',
          name: 'English',
          languageTag: 'en',
          languageName: 'English',
          isConnectable: true,
          isConnected: false
        }
      ])
    );
    env.fixture.detectChanges();
    expect(env.component.state).toEqual('input');

    env.changeSelectValue(env.projectSelect, 'pt01');

    env.clickElement(env.inputElement(env.translationSuggestionsCheckbox));
    expect(env.sourceParatextIdControl.hasError('required')).toBe(true);
    expect(env.sourceParatextIdControl.disabled).toBe(false);

    expect(env.getMenuItems(env.sourceProjectSelect).length).toEqual(3);
    expect(env.getMenuItemText(env.sourceProjectSelect, 0)).toContain('Maori');
    expect(env.getMenuItemText(env.sourceProjectSelect, 1)).toContain('Spanish');
    expect(env.getMenuItemText(env.sourceProjectSelect, 2)).toContain('Thai');
  }));

  it('should create when non-existent project is selected', fakeAsync(() => {
    const env = new TestEnvironment();
    when(env.mockedParatextService.getProjects()).thenReturn(
      of<ParatextProject[]>([
        {
          paratextId: 'pt01',
          name: 'Target',
          languageTag: 'en',
          languageName: 'English',
          isConnectable: true,
          isConnected: false
        },
        {
          paratextId: 'pt02',
          name: 'Source',
          languageTag: 'es',
          languageName: 'Spanish',
          isConnectable: false,
          isConnected: false
        }
      ])
    );
    env.fixture.detectChanges();
    expect(env.component.state).toEqual('input');

    env.changeSelectValue(env.projectSelect, 'pt01');

    env.clickElement(env.inputElement(env.checkingCheckbox));

    env.clickElement(env.inputElement(env.translationSuggestionsCheckbox));
    expect(env.sourceParatextIdControl.hasError('required')).toBe(true);
    expect(env.sourceParatextIdControl.disabled).toBe(false);

    env.changeSelectValue(env.sourceProjectSelect, 'pt02');
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

    const project: SFProject = {
      projectName: 'Target',
      paratextId: 'pt01',
      inputSystem: {
        tag: 'en',
        languageName: 'English',
        abbreviation: 'en',
        isRightToLeft: false
      },
      checkingEnabled: true,
      translationSuggestionsEnabled: true,
      sourceParatextId: 'pt02',
      sourceName: 'Source',
      sourceInputSystem: {
        languageName: 'Spanish',
        tag: 'es',
        isRightToLeft: false,
        abbreviation: 'es'
      }
    };
    verify(env.mockedSFProjectService.onlineCreate(deepEqual(project))).once();
    verify(env.mockedRouter.navigate(deepEqual(['/projects', 'project01']))).once();
  }));

  it('should create when no setting is selected', fakeAsync(() => {
    const env = new TestEnvironment();
    when(env.mockedParatextService.getProjects()).thenReturn(
      of<ParatextProject[]>([
        {
          paratextId: 'pt01',
          name: 'Target',
          languageTag: 'en',
          languageName: 'English',
          isConnectable: true,
          isConnected: false
        }
      ])
    );
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

    const project: SFProject = {
      projectName: 'Target',
      paratextId: 'pt01',
      inputSystem: {
        tag: 'en',
        languageName: 'English',
        abbreviation: 'en',
        isRightToLeft: false
      },
      checkingEnabled: false,
      translationSuggestionsEnabled: false
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
  readonly mockedRealtimeOfflineStore = mock(RealtimeOfflineStore);

  private projectDoc: SFProjectDoc;

  constructor() {
    when(this.mockedSFProjectService.onlineCreate(anything())).thenCall((project: SFProject) => {
      const newProject: SFProject = cloneDeep(project);
      newProject.sync = { queuedCount: 1 };

      this.projectDoc = new SFProjectDoc(
        new MemoryRealtimeDocAdapter('project01', OTJson0.type, newProject),
        instance(this.mockedRealtimeOfflineStore)
      );
      when(this.mockedSFProjectService.get('project01')).thenResolve(this.projectDoc);
      return Promise.resolve('project01');
    });
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
    this.projectDoc.submitJson0Op(op => op.set<number>(p => p.sync.percentCompleted, percentCompleted), false);
    tick();
    this.fixture.detectChanges();
  }

  emitSyncComplete(): void {
    this.projectDoc.submitJson0Op(op => {
      op.set<number>(p => p.sync.queuedCount, 0);
      op.unset(p => p.sync.percentCompleted);
      op.set<boolean>(p => p.sync.lastSyncSuccessful, true);
      op.set(p => p.sync.dateLastSuccessfulSync, new Date().toJSON());
    }, false);
    this.fixture.detectChanges();
  }
}
