import { DebugElement } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatStepper } from '@angular/material/stepper';
import { By } from '@angular/platform-browser';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { anything, mock, verify, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { AuthService } from 'xforge-common/auth.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { provideTestOnlineStatus } from 'xforge-common/test-online-status-providers';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { provideTestRealtime } from 'xforge-common/test-realtime-providers';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, getTestTranslocoModule } from 'xforge-common/test-utils';
import { ParatextProject } from '../../../core/models/paratext-project';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { SF_TYPE_REGISTRY } from '../../../core/models/sf-type-registry';
import { TextDoc } from '../../../core/models/text-doc';
import { ParatextService } from '../../../core/paratext.service';
import { ProjectNotificationService } from '../../../core/project-notification.service';
import { SFProjectService } from '../../../core/sf-project.service';
import { TextDocService } from '../../../core/text-doc.service';
import { BuildDto } from '../../../machine-api/build-dto';
import { ProjectSelectComponent } from '../../../project-select/project-select.component';
import { ProgressService, ProjectProgress } from '../../../shared/progress-service/progress.service';
import { DraftApplyState, DraftApplyStatus, DraftImportWizardComponent } from './draft-import-wizard.component';

const mockMatDialogRef = mock(MatDialogRef<DraftImportWizardComponent, boolean>);
const mockParatextService = mock(ParatextService);
const mockProgressService = mock(ProgressService);
const mockProjectNotificationService = mock(ProjectNotificationService);
const mockProjectService = mock(SFProjectService);
const mockTextDocService = mock(TextDocService);
const mockActivatedProjectService = mock(ActivatedProjectService);
const mockAuthService = mock(AuthService);

describe('DraftImportWizardComponent', () => {
  const buildDto: BuildDto = {
    additionalInfo: {
      dateFinished: '2026-01-14T15:16:17.18+00:00',
      translationScriptureRanges: [{ projectId: 'P01', scriptureRange: 'GEN;EXO;LEV;NUM;DEU' }]
    }
  } as BuildDto;

  configureTestingModule(() => ({
    imports: [getTestTranslocoModule()],
    providers: [
      provideTestOnlineStatus(),
      provideTestRealtime(SF_TYPE_REGISTRY),
      { provide: MatDialogRef, useMock: mockMatDialogRef },
      { provide: MAT_DIALOG_DATA, useValue: buildDto },
      { provide: ParatextService, useMock: mockParatextService },
      { provide: ProgressService, useMock: mockProgressService },
      { provide: ProjectNotificationService, useMock: mockProjectNotificationService },
      { provide: SFProjectService, useMock: mockProjectService },
      { provide: TextDocService, useMock: mockTextDocService },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService },
      { provide: ActivatedProjectService, useMock: mockActivatedProjectService },
      { provide: AuthService, useMock: mockAuthService },
      provideNoopAnimations()
    ]
  }));

  it('applies drafts to projects that are not connected', fakeAsync(() => {
    // Setup test environment
    const env = new TestEnvironment();
    env.wait();

    // Step 1
    env.selectProject('paratext02');
    env.clickNextButton(1);

    // Step 2
    env.clickNextButton(2);

    // Step 3

    // Connect to the target project
    env.syncTargetProject();

    // Step 4
    env.clickNextButton(4);

    // Step 5
    env.clickOverwriteCheckbox();
    env.clickNextButton(5);

    // Step 6
    env.importDraft();
    env.clickNextButton(6);

    // Step 7
    env.clickNextButton(7, 'sync');

    // Sync the source project
    env.syncSourceProject();

    // Close the dialog and verify it closed
    env.clickNextButton(7, 'done');
    verify(mockMatDialogRef.close(true)).once();
  }));

  it('applies drafts to projects that are already connected which do not have the books', fakeAsync(() => {
    // Setup test environment
    const env = new TestEnvironment();
    env.wait();

    // Step 1
    env.selectProject('paratext03');
    env.clickNextButton(1);

    // Step 4
    env.clickNextButton(4);

    // Step 6
    env.importDraft();
    env.clickNextButton(6);

    // Step 7
    env.clickNextButton(7, 'skip');

    // Close the dialog and verify it closed
    env.clickNextButton(7, 'done');
    verify(mockMatDialogRef.close(true)).once();
  }));

  it('applies drafts to projects that are already connected which have the books', fakeAsync(() => {
    // Setup test environment
    const env = new TestEnvironment();
    env.wait();

    // Step 1
    env.selectProject('paratext04');
    env.clickNextButton(1);

    // Step 4
    env.clickNextButton(4);

    // Step 5
    env.clickOverwriteCheckbox();
    env.clickNextButton(5);

    // Step 6
    env.importDraft();
    env.clickNextButton(6);

    // Step 7
    env.clickNextButton(7, 'skip');

    // Close the dialog and verify it closed
    env.clickNextButton(7, 'done');
    verify(mockMatDialogRef.close(true)).once();
  }));

  it('applies a single book draft to projects that are already connected which do not have the books', fakeAsync(() => {
    // Configure draft to be just one book
    configureDraftForOneBook();

    // Setup test environment
    const env = new TestEnvironment();
    env.wait();

    // Step 1
    env.selectProject('paratext03');
    env.clickNextButton(1);

    // Step 6
    env.importDraft();
    env.clickNextButton(6);

    // Step 7
    env.clickNextButton(7, 'skip');

    // Close the dialog and verify it closed
    env.clickNextButton(7, 'done');
    verify(mockMatDialogRef.close(true)).once();
  }));

  it('applies a single book draft to projects that are already connected which have the books', fakeAsync(() => {
    // Configure draft to be just one book
    configureDraftForOneBook();

    // Setup test environment
    const env = new TestEnvironment();
    env.wait();

    // Step 1
    env.selectProject('paratext04');
    env.clickNextButton(1);

    // Step 5
    env.clickOverwriteCheckbox();
    env.clickNextButton(5);

    // Step 6
    env.importDraft();
    env.clickNextButton(6);

    // Step 7
    env.clickNextButton(7, 'skip');

    // Close the dialog and verify it closed
    env.clickNextButton(7, 'done');
    verify(mockMatDialogRef.close(true)).once();
  }));
});

class TestEnvironment {
  component: DraftImportWizardComponent;
  fixture: ComponentFixture<DraftImportWizardComponent>;

  private readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

  constructor() {
    this.fixture = TestBed.createComponent(DraftImportWizardComponent);
    this.component = this.fixture.componentInstance;

    when(mockActivatedProjectService.projectId).thenReturn('project01');
    when(mockParatextService.getProjects()).thenResolve([
      // Source project
      {
        paratextId: 'paratext01',
        name: 'Project 01',
        shortName: 'P01',
        projectId: 'project01',
        isConnected: true
      } as ParatextProject,
      // Target project that is not yet on Scripture Forge
      {
        paratextId: 'paratext02',
        name: 'Project 02',
        shortName: 'P02',
        isConnectable: true
      } as ParatextProject,
      // Target project that is on Scripture Forge and does not have the books
      {
        paratextId: 'paratext03',
        name: 'Project 03',
        shortName: 'P03',
        projectId: 'project03',
        isConnected: true
      } as ParatextProject,
      // Target project that is on Scripture Forge and has the books
      {
        paratextId: 'paratext04',
        name: 'Project 04',
        shortName: 'P04',
        projectId: 'project04',
        isConnected: true
      } as ParatextProject
    ]);

    this.realtimeService.addSnapshot<SFProjectProfile>(SFProjectProfileDoc.COLLECTION, {
      id: 'project02',
      data: createTestProjectProfile({}, 2)
    });
    this.realtimeService.addSnapshot<SFProjectProfile>(SFProjectProfileDoc.COLLECTION, {
      id: 'project03',
      data: createTestProjectProfile({}, 3)
    });
    this.realtimeService.addSnapshot<SFProjectProfile>(SFProjectProfileDoc.COLLECTION, {
      id: 'project04',
      data: createTestProjectProfile(
        {
          texts: [
            { bookNum: 1, chapters: [{ number: 1 }] },
            { bookNum: 2, chapters: [{ number: 1 }] },
            { bookNum: 3, chapters: [{ number: 1 }] },
            { bookNum: 4, chapters: [{ number: 1 }] }
          ]
        },
        4
      )
    });

    when(mockProgressService.getProgress(anything(), anything())).thenResolve(
      new ProjectProgress([
        { bookId: 'GEN', verseSegments: 100, blankVerseSegments: 0 },
        { bookId: 'EXO', verseSegments: 100, blankVerseSegments: 0 },
        { bookId: 'LEV', verseSegments: 100, blankVerseSegments: 100 },
        { bookId: 'NUM', verseSegments: 22, blankVerseSegments: 2 },
        { bookId: 'DEU', verseSegments: 0, blankVerseSegments: 0 }
      ])
    );
    when(mockProjectService.getText(anything())).thenResolve({
      getNonEmptyVerses: (): string[] => ['verse_1_1']
    } as TextDoc);
    when(mockProjectService.onlineCreate(anything())).thenResolve('project02');
    when(mockProjectService.get(anything())).thenCall(id =>
      this.realtimeService.subscribe(SFProjectProfileDoc.COLLECTION, id)
    );
    when(mockTextDocService.userHasGeneralEditRight(anything())).thenReturn(true);

    this.fixture.detectChanges();
  }

  clickNextButton(step: number, suffix: string = 'next'): void {
    this.isStepVisible(step);
    const nextButton: DebugElement = this.fixture.debugElement.query(
      By.css(`.button-strip button[data-test-id="step-${step}-${suffix}"]`)
    );

    // Verify the button is present and clickable
    expect(nextButton).not.toBeNull();
    expect(nextButton.nativeElement.disabled).toBe(false);

    // Click the button
    nextButton.nativeElement.click();
    this.wait();
  }

  isStepVisible(step: number): void {
    const stepperDebug = this.fixture.debugElement.query(By.directive(MatStepper));
    const stepperInstance = stepperDebug.componentInstance;

    // Remove skipped steps
    if (step >= 5 && !this.component.showOverwriteConfirmation) --step;
    if (step >= 4 && !this.component.showBookSelection) --step;
    if (step >= 3 && !this.component.needsConnection) --step;
    if (step >= 2 && !this.component.needsConnection) --step;

    expect(stepperInstance.selectedIndex).toBe(step - 1);
  }

  clickOverwriteCheckbox(): void {
    const overwriteCheckbox: DebugElement = this.fixture.debugElement.query(By.css('mat-checkbox input'));

    // Verify the overwrite checkbox is present
    expect(overwriteCheckbox).not.toBeNull();

    // Click the checkbox
    overwriteCheckbox.nativeElement.click();
    this.wait();
  }

  importDraft(): void {
    // Ensure that the draft import was started
    verify(
      mockProjectService.onlineApplyPreTranslationToProject('project01', anything(), anything(), anything())
    ).once();

    // Have the backend notify that the draft is imported
    this.component.updateDraftApplyState('project01', {
      bookNum: 0,
      chapterNum: 0,
      status: DraftApplyStatus.Successful,
      totalChapters: 0
    } as DraftApplyState);
    this.wait();
  }

  selectProject(paratextId: string): void {
    const projectSelect: DebugElement = this.fixture.debugElement.query(By.css('app-project-select'));

    // Verify the project selector is present and clickable
    expect(projectSelect).not.toBeNull();
    const projectSelectComponent = projectSelect.componentInstance as ProjectSelectComponent;
    expect(projectSelectComponent.projects?.length ?? 0).toBeGreaterThan(0);

    // Set the selected project
    projectSelectComponent.value = paratextId;
    this.wait();
  }

  syncSourceProject(): void {
    this.component.isSyncing = false;
    this.component.syncComplete = true;
    this.wait();
  }

  syncTargetProject(): void {
    this.component.isConnecting = false;
    this.wait();
  }

  wait(): void {
    tick();
    this.fixture.detectChanges();
  }
}

function configureDraftForOneBook(): void {
  // Configure draft to be just one book
  const buildDto: BuildDto = {
    additionalInfo: {
      dateFinished: '2026-01-14T15:16:17.18+00:00',
      translationScriptureRanges: [{ projectId: 'P01', scriptureRange: 'GEN' }]
    }
  } as BuildDto;
  TestBed.overrideProvider(MAT_DIALOG_DATA, { useValue: buildDto });
}
