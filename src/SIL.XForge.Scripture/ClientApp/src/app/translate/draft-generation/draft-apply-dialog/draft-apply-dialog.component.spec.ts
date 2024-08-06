import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { MatCheckboxHarness } from '@angular/material/checkbox/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { TextInfoPermission } from 'realtime-server/lib/esm/scriptureforge/models/text-info-permission';
import { anything, mock, verify, when } from 'ts-mockito';
import { I18nService } from 'xforge-common/i18n.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { ParatextProject } from '../../../core/models/paratext-project';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
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
let env: TestEnvironment;

// TODO: Get tests to pass
xdescribe('DraftApplyDialogComponent', () => {
  configureTestingModule(() => ({
    imports: [UICommonModule, DraftApplyDialogComponent, TestTranslocoModule, NoopAnimationsModule],
    providers: [
      { provide: DraftHandlingService, useMock: mockedDraftHandlingService },
      { provide: ParatextService, useMock: mockedParatextService },
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: UserService, useMock: mockedUserService },
      { provide: TextDocService, useMock: mockedTextDocService },
      { provide: I18nService, useMock: mockedI18nService },
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
    expect(env.component.projects).toEqual(env.projects);
    verify(mockedDraftHandlingService.getAndApplyDraftAsync(anything(), anything(), anything())).never();
    env.cancelButton.click();
    tick();
    env.fixture.detectChanges();
  }));

  it('shows additional information to users', fakeAsync(() => {
    expect(env.unlistedProjectMessage).not.toBeNull();
    expect(env.overwriteContentMessage).not.toBeNull();
    expect(env.targetProjectContent).toBeNull();
  }));

  it('add button is disabled until project is selected', fakeAsync(async () => {
    expect(env.addButton).toBeTruthy();
    expect(env.addButton.attributes['disabled']).toBeDefined();
    env.component.targetProjectId = 'project01';
    tick();
    env.fixture.detectChanges();
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
    env.component.targetProjectId = 'project01';
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
    env.component.projectSelectedAsync('pt01');
    const harness = await env.checkboxHarnessAsync();
    harness.check();
    tick(100);
    env.fixture.detectChanges();
    tick(100);
    env.fixture.detectChanges();
    console.log('checking content');
    expect(env.targetProjectContent).not.toBeNull();
    expect(env.component.targetProjectId).toBe('project01');
    verify(mockedProjectService.getProfile(anything())).once();
    verify(mockedTextDocService.userHasGeneralEditRight(anything())).once();
    tick();
    env.fixture.detectChanges();
    expect(env.addButton.attributes['disabled']).toBeUndefined();
    expect(env.cannotEditMessage).toBeNull();
  }));

  it('notifies user if no edit permissions', fakeAsync(() => {
    env.component.projectSelectedAsync('pt02');
    tick();
    env.fixture.detectChanges();
    expect(env.component.targetProjectId).toBe('project02');
    verify(mockedProjectService.getProfile(anything())).once();
    verify(mockedTextDocService.userHasGeneralEditRight(anything())).once();
    tick();
    env.fixture.detectChanges();
    expect(env.addButton.attributes['disabled']).toBeDefined();
    expect(env.cannotEditMessage).not.toBeNull();
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
      name: 'Project 01',
      shortName: 'P01',
      languageTag: 'en',
      isConnectable: true,
      isConnected: true
    },
    {
      paratextId: 'pt02',
      projectId: 'project02',
      name: 'Project 02',
      shortName: 'P02',
      languageTag: 'fr',
      isConnectable: true,
      isConnected: true
    },
    {
      paratextId: 'pt03',
      projectId: 'project03',
      name: 'Project 03',
      shortName: 'P03',
      languageTag: 'es',
      isConnectable: true,
      isConnected: false
    }
  ];

  constructor() {
    when(mockedParatextService.getProjects()).thenReturn(Promise.resolve(this.projects));
    when(mockedUserService.currentUserId).thenReturn('user01');
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

  async checkboxHarnessAsync(): Promise<MatCheckboxHarness> {
    return await this.loader.getHarness(MatCheckboxHarness.with({ selector: '.overwrite-content' }));
  }

  private setupProject(): void {
    const projectPermissions = [
      { id: 'project01', permission: TextInfoPermission.Write },
      { id: 'project02', permission: TextInfoPermission.Read }
    ];
    for (const { id, permission } of projectPermissions) {
      const mockedProject = {
        id,
        data: createTestProjectProfile({
          userRoles: { user01: SFProjectRole.ParatextAdministrator },
          texts: [
            {
              bookNum: 1,
              chapters: [{ number: 1, permissions: { user01: permission } }],
              permissions: { user01: permission }
            }
          ]
        })
      } as SFProjectProfileDoc;
      when(mockedProjectService.getProfile(id)).thenReturn(Promise.resolve(mockedProject));
    }
    when(mockedTextDocService.userHasGeneralEditRight(anything())).thenReturn(true);
  }
}
