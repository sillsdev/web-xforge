import { OverlayContainer } from '@angular/cdk/overlay';
import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { Component } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { MatAutocompleteHarness } from '@angular/material/autocomplete/testing';
import { MatCheckboxHarness } from '@angular/material/checkbox/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter, Route } from '@angular/router';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { TextInfoPermission } from 'realtime-server/lib/esm/scriptureforge/models/text-info-permission';
import { of } from 'rxjs';
import { anything, mock, verify, when } from 'ts-mockito';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { provideTestOnlineStatus } from 'xforge-common/test-online-status-providers';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { configureTestingModule, getTestTranslocoModule } from 'xforge-common/test-utils';
import { SFUserProjectsService } from 'xforge-common/user-projects.service';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { TextDoc } from '../../../core/models/text-doc';
import { SFProjectService } from '../../../core/sf-project.service';
import { TextDocService } from '../../../core/text-doc.service';
import { projectLabel } from '../../../shared/utils';
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
    imports: [getTestTranslocoModule()],
    providers: [
      provideRouter(ROUTES),
      provideTestOnlineStatus(),
      provideNoopAnimations(),
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
    await env.selectParatextProject('paratextId1');
    expect(env.matErrorMessage).toBeNull();
    env.addButton.click();
    tick();
    env.fixture.detectChanges();
    verify(mockedDialogRef.close()).never();
    expect(env.matErrorMessage).toBe('Please confirm you want to overwrite the book.');
    const harness = await env.overwriteCheckboxHarness();
    harness.check();
    tick();
    env.fixture.detectChanges();
    expect(env.matErrorMessage).toBeNull();
    env.addButton.click();
    tick();
    env.fixture.detectChanges();
    verify(mockedDialogRef.close(anything())).once();
  }));

  it('can add draft to project when project selected', fakeAsync(async () => {
    await env.selectParatextProject('paratextId1');
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
    await env.selectParatextProject('paratextId1');
    const harness = await env.overwriteCheckboxHarness();
    harness.check();
    tick();
    env.fixture.detectChanges();
    expect(env.targetProjectContent).not.toBeNull();
    expect(env.component['targetProjectId']).toBe('project01');
    verify(mockedTextDocService.userHasGeneralEditRight(anything())).twice();
    tick();
    env.fixture.detectChanges();
    expect(env.component.isValid).toBeTrue();
    expect(env.matErrorMessage).toBeNull();
    // expect(env.component.getCustomErrorState()).toBe(CustomValidatorState.None);
  }));

  it('notifies user if no edit permissions', fakeAsync(async () => {
    await env.selectParatextProject('paratextId2');
    expect(env.component['targetProjectId']).toBe('project02');
    verify(mockedTextDocService.userHasGeneralEditRight(anything())).twice();
    tick();
    env.fixture.detectChanges();
    flush();
    tick();
    env.fixture.detectChanges();
    flush();
    tick();
    env.fixture.detectChanges();
    flush();
    expect(env.component.isValid).toBeFalse();
    // The following assertion passes
    expect(env.component.projectSelect?.error).toBe(
      "You do not have permission to write to this book on this project. Contact the project's administrator to get permission."
    );
    // The following assertion fails because the value is null, even though it seems to be working in the application itself
    expect(env.matErrorMessage).toBe(
      "You do not have permission to write to this book on this project. Contact the project's administrator to get permission."
    );
    // hides the message when an invalid project is selected
    await env.selectParatextProject('');
    tick();
    env.fixture.detectChanges();
    // expect(env.component.getCustomErrorState()).toBe(CustomValidatorState.InvalidProject);
    expect(env.matErrorMessage).toBe('Please select a valid project or resource');
    expect(env.component.isValid).toBeFalse();
  }));

  it('user must confirm create chapters if book has missing chapters', fakeAsync(async () => {
    const projectDoc = {
      id: 'project03',
      data: createTestProjectProfile(
        {
          paratextId: 'paratextId3',
          userRoles: { user01: SFProjectRole.ParatextAdministrator },
          texts: [
            {
              bookNum: 1,
              chapters: [{ number: 1, permissions: { user01: TextInfoPermission.Write }, lastVerse: 31 }],
              permissions: { user01: TextInfoPermission.Write }
            }
          ]
        },
        3
      )
    } as SFProjectProfileDoc;
    env = new TestEnvironment({ projectDoc });
    await env.selectParatextProject('paratextId3');
    expect(env.component['targetProjectId']).toBe('project03');
    tick();
    env.fixture.detectChanges();
    expect(env.component.projectHasMissingChapters()).toBe(true);
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
      data: createTestProjectProfile(
        {
          paratextId: 'paratextId3',
          userRoles: { user01: SFProjectRole.ParatextAdministrator },
          texts: [
            {
              bookNum: 1,
              chapters: [{ number: 1, permissions: { user01: TextInfoPermission.Write }, lastVerse: 0 }],
              permissions: { user01: TextInfoPermission.Write }
            }
          ]
        },
        3
      )
    } as SFProjectProfileDoc;
    env = new TestEnvironment({ projectDoc });
    await env.selectParatextProject('paratextId3');
    expect(env.component['targetProjectId']).toBe('project03');
    tick();
    env.fixture.detectChanges();
    expect(env.component.projectHasMissingChapters()).toBe(true);
    const overwriteHarness = await env.overwriteCheckboxHarness();
    await overwriteHarness.check();
    const createChapters = await env.createChaptersCheckboxHarnessAsync();
    expect(createChapters).not.toBeNull();
    env.component.addToProject();
    tick();
    env.fixture.detectChanges();
    verify(mockedDialogRef.close(anything())).never();

    // select a valid project
    await env.selectParatextProject('paratextId1');
    expect(env.component['targetProjectId']).toBe('project01');
    tick();
    env.fixture.detectChanges();
    expect(env.component.projectHasMissingChapters()).toBe(false);
    env.component.addToProject();
    tick();
    env.fixture.detectChanges();
    verify(mockedDialogRef.close(anything())).once();
  }));

  it('updates the target project info when updating the project in the selector', fakeAsync(async () => {
    await env.selectParatextProject('paratextId1');
    expect(env.targetProjectContent.textContent).toContain('Test project 1');
    // the user does not have permission to edit 'paratextId2' so the info section is hidden
    await env.selectParatextProject('paratextId2');
    tick();
    flush();
    env.fixture.detectChanges();
    tick();
    flush();
    env.fixture.detectChanges();
    expect(env.targetProjectContent).toBeNull();
  }));

  it('notifies user if offline', fakeAsync(async () => {
    await env.selectParatextProject('paratextId1');
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

// Helper harness that wires the component under test with mocked services and DOM helpers.
class TestEnvironment {
  component: DraftApplyDialogComponent;
  fixture: ComponentFixture<DraftApplyDialogComponent>;
  loader: HarnessLoader;

  onlineStatusService = TestBed.inject(OnlineStatusService) as TestOnlineStatusService;
  private readonly overlayContainer = TestBed.inject(OverlayContainer);

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

  get matErrorMessage(): string | null {
    const matErrors: HTMLElement[] = Array.from(this.fixture.nativeElement.querySelectorAll('mat-error'));
    if (matErrors.length === 0) return null;
    expect(matErrors.length).toBe(1);
    return matErrors[0].textContent!.trim();
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

  async selectParatextProject(paratextId: string): Promise<void> {
    const autocomplete = await this.loader.getHarness(MatAutocompleteHarness);
    await autocomplete.focus();

    if (paratextId === '') {
      await autocomplete.clear();
      await autocomplete.blur();
      await this.stabilizeFormAsync();
      return;
    }

    const project = this.component.projects.find(p => p.paratextId === paratextId);
    expect(project).withContext(`Missing project for ${paratextId}`).toBeDefined();
    if (project == null) {
      return;
    }

    const searchText = project.shortName ?? project.name ?? paratextId;
    await autocomplete.clear();
    await autocomplete.enterText(searchText);
    await autocomplete.selectOption({ text: projectLabel(project) });
    await autocomplete.blur();
    await this.stabilizeFormAsync();
  }

  private async stabilizeFormAsync(): Promise<void> {
    await this.fixture.whenStable();
    tick();
    this.fixture.detectChanges();
    this.clearOverlayContainer();
  }

  private clearOverlayContainer(): void {
    const container = this.overlayContainer.getContainerElement();
    if (container.childElementCount > 0) {
      container.innerHTML = '';
    }
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
