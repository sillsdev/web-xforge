import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { Component } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { MatCheckboxHarness } from '@angular/material/checkbox/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Route, RouterModule } from '@angular/router';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { TextInfoPermission } from 'realtime-server/lib/esm/scriptureforge/models/text-info-permission';
import { of } from 'rxjs';
import { anything, mock, verify, when } from 'ts-mockito';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { SFUserProjectsService } from 'xforge-common/user-projects.service';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { TextDoc } from '../../../core/models/text-doc';
import { SFProjectService } from '../../../core/sf-project.service';
import { TextDocService } from '../../../core/text-doc.service';
import { CustomValidatorState } from '../../../shared/sfvalidators';
import { DraftApplyDialogComponent } from './draft-apply-dialog.component';

const mockedUserProjectsService = mock(SFUserProjectsService);
const mockedProjectService = mock(SFProjectService);
const mockedUserService = mock(UserService);
const mockedDialogRef = mock(MatDialogRef);
const mockedTextDocService = mock(TextDocService);

@Component({
  template: `<div>Mock</div>`
})
class MockComponent {}

const ROUTES: Route[] = [{ path: 'projects', component: MockComponent }];

let env: TestEnvironment;

describe('DraftApplyDialogComponent', () => {
  configureTestingModule(() => ({
    imports: [
      TestTranslocoModule,
      RouterModule.forRoot(ROUTES),
      NoopAnimationsModule,
      TestOnlineStatusModule.forRoot()
    ],
    providers: [
      { provide: SFUserProjectsService, useMock: mockedUserProjectsService },
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: UserService, useMock: mockedUserService },
      { provide: TextDocService, useMock: mockedTextDocService },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService },
      { provide: MatDialogRef, useMock: mockedDialogRef },
      { provide: MAT_DIALOG_DATA, useValue: { bookNum: 1, chapters: [1, 2] } }
    ]
  }));

  beforeEach(async () => {
    env = new TestEnvironment();
  });

  it('can get projects', fakeAsync(() => {
    expect(env.cancelButton).toBeTruthy();
    expect(env.component.projects.map(p => p.paratextId)).toEqual(['paratextId1', 'paratextId2']);
    env.cancelButton.click();
    tick();
    env.fixture.detectChanges();
  }));

  it('shows additional information to users', fakeAsync(() => {
    expect(env.unlistedProjectMessage).not.toBeNull();
    expect(env.overwriteContentMessage).toBeNull();
    expect(env.targetProjectContent).toBeNull();
  }));

  it('add button does not work until form is valid', fakeAsync(async () => {
    expect(env.addButton).toBeTruthy();
    env.selectParatextProject('paratextId1');
    expect(env.confirmOverwriteErrorMessage).toBeNull();
    env.addButton.click();
    tick();
    env.fixture.detectChanges();
    verify(mockedDialogRef.close()).never();
    expect(env.confirmOverwriteErrorMessage).not.toBeNull();
    const harness = await env.overwriteCheckboxHarness();
    harness.check();
    tick();
    env.fixture.detectChanges();
    expect(env.confirmOverwriteErrorMessage).toBeNull();
    env.addButton.click();
    tick();
    env.fixture.detectChanges();
    verify(mockedDialogRef.close(anything())).once();
  }));

  it('can add draft to project when project selected', fakeAsync(async () => {
    env.selectParatextProject('paratextId1');
    const harness = await env.overwriteCheckboxHarness();
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
    env.selectParatextProject('paratextId1');
    const harness = await env.overwriteCheckboxHarness();
    harness.check();
    tick();
    env.fixture.detectChanges();
    expect(env.targetProjectContent).not.toBeNull();
    expect(env.component['targetProjectId']).toBe('project01');
    verify(mockedTextDocService.userHasGeneralEditRight(anything())).once();
    tick();
    env.fixture.detectChanges();
    expect(env.component['getCustomErrorState']()).toBe(CustomValidatorState.None);
  }));

  it('notifies user if no edit permissions', fakeAsync(() => {
    env.selectParatextProject('paratextId2');
    expect(env.component['targetProjectId']).toBe('project02');
    verify(mockedTextDocService.userHasGeneralEditRight(anything())).once();
    tick();
    env.fixture.detectChanges();
    expect(env.component['getCustomErrorState']()).toBe(CustomValidatorState.NoWritePermissions);
    // hides the message when an invalid project is selected
    env.selectParatextProject('');
    tick();
    env.fixture.detectChanges();
    expect(env.component['getCustomErrorState']()).toBe(CustomValidatorState.InvalidProject);
  }));

  it('user must confirm create chapters if book has missing chapters', fakeAsync(async () => {
    const projectDoc = {
      id: 'project03',
      data: createTestProjectProfile({
        paratextId: 'paratextId3',
        userRoles: { user01: SFProjectRole.ParatextAdministrator },
        texts: [
          {
            bookNum: 1,
            chapters: [{ number: 1, permissions: { user01: TextInfoPermission.Write }, lastVerse: 31 }],
            permissions: { user01: TextInfoPermission.Write }
          }
        ]
      })
    } as SFProjectProfileDoc;
    env = new TestEnvironment({ projectDoc });
    env.selectParatextProject('paratextId3');
    expect(env.component['targetProjectId']).toBe('project03');
    tick();
    env.fixture.detectChanges();
    expect(env.component.projectHasMissingChapters).toBe(true);
    const overwriteHarness = await env.overwriteCheckboxHarness();
    await overwriteHarness.check();
    const createChapters = await env.createChaptersCheckboxHarnessAsync();
    expect(createChapters).not.toBeNull();
    env.component.addToProject();
    tick();
    env.fixture.detectChanges();
    verify(mockedDialogRef.close(anything())).never();

    // check the checkbox
    await createChapters.check();
    tick();
    env.fixture.detectChanges();
    env.component.addToProject();
    tick();
    env.fixture.detectChanges();
    verify(mockedDialogRef.close(anything())).once();
  }));

  it('user must confirm create chapters if book is empty', fakeAsync(async () => {
    const projectDoc = {
      id: 'project03',
      data: createTestProjectProfile({
        paratextId: 'paratextId3',
        userRoles: { user01: SFProjectRole.ParatextAdministrator },
        texts: [
          {
            bookNum: 1,
            chapters: [{ number: 1, permissions: { user01: TextInfoPermission.Write }, lastVerse: 0 }],
            permissions: { user01: TextInfoPermission.Write }
          }
        ]
      })
    } as SFProjectProfileDoc;
    env = new TestEnvironment({ projectDoc });
    env.selectParatextProject('paratextId3');
    expect(env.component['targetProjectId']).toBe('project03');
    tick();
    env.fixture.detectChanges();
    expect(env.component.projectHasMissingChapters).toBe(true);
    const overwriteHarness = await env.overwriteCheckboxHarness();
    await overwriteHarness.check();
    const createChapters = await env.createChaptersCheckboxHarnessAsync();
    expect(createChapters).not.toBeNull();
    env.component.addToProject();
    tick();
    env.fixture.detectChanges();
    verify(mockedDialogRef.close(anything())).never();

    // select a valid project
    env.selectParatextProject('paratextId1');
    expect(env.component['targetProjectId']).toBe('project01');
    tick();
    env.fixture.detectChanges();
    expect(env.component.projectHasMissingChapters).toBe(false);
    env.component.addToProject();
    tick();
    env.fixture.detectChanges();
    verify(mockedDialogRef.close(anything())).once();
  }));

  it('updates the target project info when updating the project in the selector', fakeAsync(() => {
    env.selectParatextProject('paratextId1');
    expect(env.targetProjectContent.textContent).toContain('Test project 1');
    // the user does not have permission to edit 'paratextId2' so the info section is hidden
    env.selectParatextProject('paratextId2');
    expect(env.targetProjectContent).toBeNull();
  }));

  it('notifies user if offline', fakeAsync(async () => {
    env.selectParatextProject('paratextId1');
    expect(env.offlineWarning).toBeNull();
    const harness = await env.overwriteCheckboxHarness();
    harness.check();
    tick();
    env.fixture.detectChanges();
    env.onlineStatus = false;
    tick();
    env.fixture.detectChanges();
    expect(env.offlineWarning).not.toBeNull();
  }));
});

class TestEnvironment {
  component: DraftApplyDialogComponent;
  fixture: ComponentFixture<DraftApplyDialogComponent>;
  loader: HarnessLoader;

  onlineStatusService = TestBed.inject(OnlineStatusService) as TestOnlineStatusService;

  constructor(args: { projectDoc?: SFProjectProfileDoc } = {}) {
    when(mockedUserService.currentUserId).thenReturn('user01');
    this.setupProject(args.projectDoc);
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

  get targetProjectContent(): HTMLElement {
    return this.fixture.nativeElement.querySelector('.target-project-content');
  }

  get overwriteContentMessage(): HTMLElement {
    return this.fixture.nativeElement.querySelector('.overwrite-content');
  }

  get unlistedProjectMessage(): HTMLElement {
    return this.fixture.nativeElement.querySelector('.unlisted-project-message');
  }

  get offlineWarning(): HTMLElement {
    return this.fixture.nativeElement.querySelector('.offline-message');
  }

  get confirmOverwriteErrorMessage(): HTMLElement {
    return this.fixture.nativeElement.querySelector('.form-error.visible');
  }

  set onlineStatus(online: boolean) {
    this.onlineStatusService.setIsOnline(online);
    tick();
    this.fixture.detectChanges();
  }

  async overwriteCheckboxHarness(): Promise<MatCheckboxHarness> {
    return await this.loader.getHarness(MatCheckboxHarness.with({ selector: '.overwrite-content' }));
  }

  async createChaptersCheckboxHarnessAsync(): Promise<MatCheckboxHarness> {
    return await this.loader.getHarness(MatCheckboxHarness.with({ selector: '.create-chapters' }));
  }

  selectParatextProject(paratextId: string): void {
    env.component.addToProjectForm.controls.targetParatextId.setValue(paratextId);
    tick();
    this.fixture.detectChanges();
  }

  private setupProject(projectDoc?: SFProjectProfileDoc): void {
    const projectPermissions = [
      { id: 'project01', permission: TextInfoPermission.Write },
      { id: 'project02', permission: TextInfoPermission.Read },
      { id: 'resource03', permission: TextInfoPermission.Read }
    ];
    const mockProjectDocs: SFProjectProfileDoc[] = [];
    let projectNum = 1;
    for (const { id, permission } of projectPermissions) {
      const mockedProject = {
        id,
        data: createTestProjectProfile(
          {
            paratextId: id.startsWith('resource') ? `resource16char0${projectNum}` : `paratextId${projectNum}`,
            userRoles: { user01: SFProjectRole.ParatextAdministrator },
            texts: [
              {
                bookNum: 1,
                chapters: [
                  { number: 1, permissions: { user01: permission }, lastVerse: 31 },
                  { number: 2, permissions: { user01: permission }, lastVerse: 25 }
                ],
                permissions: { user01: permission }
              }
            ]
          },
          projectNum++
        )
      } as SFProjectProfileDoc;
      mockProjectDocs.push(mockedProject);
    }
    if (projectDoc != null) {
      mockProjectDocs.push(projectDoc);
    }
    when(mockedUserProjectsService.projectDocs$).thenReturn(of(mockProjectDocs));
    const mockedTextDoc = {
      getNonEmptyVerses: (): string[] => ['verse_1_1', 'verse_1_2', 'verse_1_3']
    } as TextDoc;
    when(mockedProjectService.getText(anything())).thenResolve(mockedTextDoc);
    when(mockedTextDocService.userHasGeneralEditRight(anything())).thenReturn(true);
  }
}
