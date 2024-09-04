import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { MatCheckboxHarness } from '@angular/material/checkbox/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Route, RouterModule } from '@angular/router';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { TextInfoPermission } from 'realtime-server/lib/esm/scriptureforge/models/text-info-permission';
import { anything, mock, verify, when } from 'ts-mockito';
import { I18nService } from 'xforge-common/i18n.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { OnlineStatusService } from '../../../../xforge-common/online-status.service';
import { TestOnlineStatusService } from '../../../../xforge-common/test-online-status.service';
import { ParatextProject } from '../../../core/models/paratext-project';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { TextDoc } from '../../../core/models/text-doc';
import { ParatextService } from '../../../core/paratext.service';
import { SFProjectService } from '../../../core/sf-project.service';
import { TextDocService } from '../../../core/text-doc.service';
import { DraftHandlingService } from '../draft-handling.service';
import { DraftApplyDialogComponent } from './draft-apply-dialog.component';

const mockedDraftHandlingService = mock(DraftHandlingService);
const mockedParatextService = mock(ParatextService);
const mockedProjectService = mock(SFProjectService);
const mockedUserService = mock(UserService);
const mockedDialogRef = mock(MatDialogRef);
const mockedTextDocService = mock(TextDocService);
const mockedI18nService = mock(I18nService);

@Component({
  template: `<div>Mock</div>`
})
class MockComponent {}

const ROUTES: Route[] = [{ path: 'projects', component: MockComponent }];

let env: TestEnvironment;

describe('DraftApplyDialogComponent', () => {
  configureTestingModule(() => ({
    imports: [
      UICommonModule,
      DraftApplyDialogComponent,
      TestTranslocoModule,
      RouterModule.forRoot(ROUTES),
      NoopAnimationsModule,
      HttpClientTestingModule,
      TestOnlineStatusModule.forRoot()
    ],
    providers: [
      { provide: DraftHandlingService, useMock: mockedDraftHandlingService },
      { provide: ParatextService, useMock: mockedParatextService },
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: UserService, useMock: mockedUserService },
      { provide: TextDocService, useMock: mockedTextDocService },
      { provide: I18nService, useMock: mockedI18nService },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService },
      { provide: MatDialogRef, useMock: mockedDialogRef },
      { provide: MAT_DIALOG_DATA, useValue: { bookNum: 1 } }
    ]
  }));

  beforeEach(async () => {
    env = new TestEnvironment();
  });

  it('can get projects', fakeAsync(() => {
    expect(env.cancelButton).toBeTruthy();
    verify(mockedParatextService.getProjects()).once();
    tick();
    env.fixture.detectChanges();
    expect(env.component.projects.length).toEqual(env.projects.length - 1);
    expect(env.component.projects.map(p => p.paratextId)).toEqual(['pt01', 'pt02']);
    verify(mockedDraftHandlingService.getAndApplyDraftAsync(anything(), anything(), anything())).never();
    env.cancelButton.click();
    tick();
    env.fixture.detectChanges();
  }));

  it('shows additional information to users', fakeAsync(() => {
    expect(env.unlistedProjectMessage).not.toBeNull();
    expect(env.overwriteContentMessage).toBeNull();
    expect(env.targetProjectContent).toBeNull();
    expect(env.getProjectsFailedMessage).toBeNull();
  }));

  it('shows error when loading project fails', fakeAsync(() => {
    env.component.projectLoadingFailed = true;
    verify(mockedParatextService.getProjects()).once();
    tick();
    env.fixture.detectChanges();
    expect(env.getProjectsFailedMessage).not.toBeNull();
  }));

  it('add button is disabled until project is selected', fakeAsync(async () => {
    expect(env.addButton).toBeTruthy();
    expect(env.addButton.attributes['disabled']).toBeDefined();
    env.selectParatextProject('pt01');
    expect(env.addButton.attributes['disabled']).toBeDefined();
    const harness = await env.checkboxHarnessAsync();
    harness.check();
    tick();
    env.fixture.detectChanges();
    expect(env.addButton.attributes['disabled']).toBeUndefined();
    env.cancelButton.click();
    tick();
    env.fixture.detectChanges();
  }));

  it('can add draft to project when project selected', fakeAsync(async () => {
    env.selectParatextProject('pt01');
    const harness = await env.checkboxHarnessAsync();
    harness.check();
    tick();
    env.fixture.detectChanges();
    expect(env.addButton.attributes['disabled']).toBeUndefined();
    env.component.addToProject();
    tick();
    env.fixture.detectChanges();
    verify(mockedDialogRef.close(anything())).once();
  }));

  it('checks if the user has edit permissions', fakeAsync(async () => {
    env.selectParatextProject('pt01');
    const harness = await env.checkboxHarnessAsync();
    harness.check();
    tick();
    env.fixture.detectChanges();
    expect(env.targetProjectContent).not.toBeNull();
    expect(env.component['targetProjectId']).toBe('project01');
    verify(mockedProjectService.getProfile(anything())).once();
    verify(mockedTextDocService.userHasGeneralEditRight(anything())).once();
    tick();
    env.fixture.detectChanges();
    expect(env.addButton.attributes['disabled']).toBeUndefined();
    expect(env.cannotEditMessage).toBeNull();
  }));

  it('notifies user if no edit permissions', fakeAsync(() => {
    env.selectParatextProject('pt02');
    expect(env.component['targetProjectId']).toBe('project02');
    verify(mockedProjectService.getProfile(anything())).once();
    verify(mockedTextDocService.userHasGeneralEditRight(anything())).once();
    tick();
    env.fixture.detectChanges();
    expect(env.addButton.attributes['disabled']).toBeDefined();
    expect(env.cannotEditMessage).not.toBeNull();
  }));

  it('updates the target project info when updating the project in the selector', fakeAsync(() => {
    env.selectParatextProject('pt01');
    expect(env.targetProjectContent.textContent).toContain('Test project 1');
    // the user does not have permission to edit 'pt02' so the info section is hidden
    env.selectParatextProject('pt02');
    expect(env.targetProjectContent).toBeNull();
  }));

  it('notifies user if offline', fakeAsync(async () => {
    env.selectParatextProject('pt01');
    expect(env.offlineWarning).toBeNull();
    const harness = await env.checkboxHarnessAsync();
    harness.check();
    tick();
    env.fixture.detectChanges();
    expect(env.addButton.attributes['disabled']).toBeUndefined();
    // when(mockedOnlineStatusService.isOnline).thenReturn(false);
    env.onlineStatus = false;
    tick();
    env.fixture.detectChanges();
    expect(env.offlineWarning).not.toBeNull();
    expect(env.addButton.attributes['disabled']).toBeDefined();
  }));
});

class TestEnvironment {
  component: DraftApplyDialogComponent;
  fixture: ComponentFixture<DraftApplyDialogComponent>;
  loader: HarnessLoader;

  projects: ParatextProject[] = [
    {
      paratextId: 'pt01',
      projectId: 'project01',
      name: 'Test project 1',
      shortName: 'P01',
      languageTag: 'en',
      isConnectable: true,
      isConnected: true
    },
    {
      paratextId: 'pt02',
      projectId: 'project02',
      name: 'Test project 2',
      shortName: 'P02',
      languageTag: 'fr',
      isConnectable: true,
      isConnected: true
    },
    {
      paratextId: 'pt03',
      projectId: undefined,
      name: 'Project 03',
      shortName: 'P03',
      languageTag: 'es',
      isConnectable: true,
      isConnected: false
    }
  ];
  onlineStatusService = TestBed.inject(OnlineStatusService) as TestOnlineStatusService;

  constructor() {
    when(mockedParatextService.getProjects()).thenResolve(this.projects);
    when(mockedUserService.currentUserId).thenReturn('user01');
    when(mockedI18nService.localizeBook(anything())).thenReturn('Genesis');
    when(mockedI18nService.translateTextAroundTemplateTags(anything())).thenReturn({
      before: '',
      templateTagText: 'text',
      after: ''
    });
    this.setupProject();
    this.fixture = TestBed.createComponent(DraftApplyDialogComponent);
    this.loader = TestbedHarnessEnvironment.loader(this.fixture);
    this.component = this.fixture.componentInstance;
    this.fixture.detectChanges();
  }

  get addButton(): HTMLElement {
    return this.fixture.nativeElement.querySelector('.add-button');
  }

  get cancelButton(): HTMLElement {
    return this.fixture.nativeElement.querySelector('.cancel-button');
  }

  get cannotEditMessage(): HTMLElement {
    return this.fixture.nativeElement.querySelector('.cannot-edit-message');
  }

  get targetProjectContent(): HTMLElement {
    return this.fixture.nativeElement.querySelector('.target-project-content');
  }

  get overwriteContentMessage(): HTMLElement {
    return this.fixture.nativeElement.querySelector('.overwrite-content');
  }

  get unlistedProjectMessage(): HTMLElement {
    return this.fixture.nativeElement.querySelector('.unlisted-project-message');
  }

  get getProjectsFailedMessage(): HTMLElement {
    return this.fixture.nativeElement.querySelector('.fetch-projects-failed-message');
  }

  get offlineWarning(): HTMLElement {
    return this.fixture.nativeElement.querySelector('.offline-message');
  }

  set onlineStatus(online: boolean) {
    this.onlineStatusService.setIsOnline(online);
    tick();
    this.fixture.detectChanges();
  }

  async checkboxHarnessAsync(): Promise<MatCheckboxHarness> {
    return await this.loader.getHarness(MatCheckboxHarness.with({ selector: '.overwrite-content' }));
  }

  selectParatextProject(paratextId: string): void {
    env.component.addToProjectForm.controls.targetParatextId.setValue(paratextId);
    env.component.projectSelectedAsync(paratextId);
    tick();
    this.fixture.detectChanges();
  }

  private setupProject(): void {
    const projectPermissions = [
      { id: 'project01', permission: TextInfoPermission.Write },
      { id: 'project02', permission: TextInfoPermission.Read }
    ];
    let projectNum = 1;
    for (const { id, permission } of projectPermissions) {
      const mockedProject = {
        id,
        data: createTestProjectProfile(
          {
            userRoles: { user01: SFProjectRole.ParatextAdministrator },
            texts: [
              {
                bookNum: 1,
                chapters: [{ number: 1, permissions: { user01: permission } }],
                permissions: { user01: permission }
              }
            ]
          },
          projectNum++
        )
      } as SFProjectProfileDoc;
      when(mockedProjectService.getProfile(id)).thenResolve(mockedProject);
    }
    const mockedTextDoc = {
      getNonEmptyVerses: (): string[] => ['verse_1_1', 'verse_1_2', 'verse_1_3']
    } as TextDoc;
    when(mockedProjectService.getText(anything())).thenResolve(mockedTextDoc);
    when(mockedTextDocService.userHasGeneralEditRight(anything())).thenReturn(true);
  }
}
