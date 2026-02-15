import { AfterViewInit, Component, DestroyRef, Input, OnChanges, ViewChild } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Canon } from '@sillsdev/scripture';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { defaultTranslocoMarkupTranspilers } from 'ngx-transloco-markup';
import { of } from 'rxjs';
import { anything, instance, mock, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { AuthService } from 'xforge-common/auth.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { ParatextProject } from '../../../core/models/paratext-project';
import { SFProjectDoc } from '../../../core/models/sf-project-doc';
import { ParatextService } from '../../../core/paratext.service';
import { ProjectNotificationService } from '../../../core/project-notification.service';
import { SFProjectService } from '../../../core/sf-project.service';
import { TextDocService } from '../../../core/text-doc.service';
import { BuildDto } from '../../../machine-api/build-dto';
import { ProgressService, ProjectProgress } from '../../../shared/progress-service/progress.service';
import {
  BookForImport,
  BookWithExistingText,
  DraftImportWizardComponent,
  ImportProgress
} from './draft-import-wizard.component';

const mockDestroyRef = mock(DestroyRef);
const mockMatDialogRef = mock(MatDialogRef<DraftImportWizardComponent, boolean>);
const mockParatextService = mock(ParatextService);
const mockProgressService = mock(ProgressService);
const mockProjectNotificationService = mock(ProjectNotificationService);
const mockProjectService = mock(SFProjectService);
const mockTextDocService = mock(TextDocService);
const mockActivatedProjectService = mock(ActivatedProjectService);
const mockAuthService = mock(AuthService);
const mockOnlineStatusService = mock(OnlineStatusService);

@Component({
  selector: 'app-draft-import-wizard-wrapper',
  standalone: true,
  imports: [DraftImportWizardComponent],
  template: `<app-draft-import-wizard></app-draft-import-wizard>`
})
class DraftImportWizardWrapperComponent implements AfterViewInit, OnChanges {
  @ViewChild(DraftImportWizardComponent) component!: DraftImportWizardComponent;
  @Input() online: boolean = false;
  @Input() canEditProject: boolean = true;
  @Input() importComplete: boolean = false;
  @Input() importStepTriggered: boolean = false;
  @Input() isConnecting: boolean = false;
  @Input() isImporting: boolean = false;
  @Input() isLoadingProject: boolean = false;
  @Input() isLoadingProjects: boolean = false;
  @Input() isSyncing: boolean = false;
  @Input() needsConnection: boolean = false;
  @Input() projectLoadingFailed: boolean = false;
  @Input() showBookSelection: boolean = false;
  @Input() showOverwriteConfirmation: boolean = false;
  @Input() skipSync: boolean = false;
  @Input() syncComplete: boolean = false;
  @Input() connectionError?: string;
  @Input() importError?: string;
  @Input() targetProjectId?: string;
  @Input() selectedParatextProject?: ParatextProject;
  @Input() availableBooksForImport: BookForImport[] = [];
  @Input() booksWithExistingText: BookWithExistingText[] = [];
  @Input() importProgress: ImportProgress[] = [];
  @Input() step: number = 0;

  ngAfterViewInit(): void {
    this.updateComponent();
  }

  ngOnChanges(): void {
    this.updateComponent();
  }

  private updateComponent(): void {
    if (!this.component) return;
    setTimeout(() => {
      // Set the story specific arguments
      this.component.canEditProject = this.canEditProject;
      this.component.importComplete = this.importComplete;
      this.component.importStepTriggered = this.importStepTriggered;
      this.component.isConnecting = this.isConnecting;
      this.component.isImporting = this.isImporting;
      this.component.isLoadingProject = this.isLoadingProject;
      this.component.isLoadingProjects = this.isLoadingProjects;
      this.component.isSyncing = this.isSyncing;
      this.component.needsConnection = this.needsConnection;
      this.component.projectLoadingFailed = this.projectLoadingFailed;
      this.component.showBookSelection = this.showBookSelection;
      this.component.showOverwriteConfirmation = this.showOverwriteConfirmation;
      this.component.skipSync = this.skipSync;
      this.component.syncComplete = this.syncComplete;
      this.component.connectionError = this.connectionError;
      this.component.importError = this.importError;
      this.component.targetProjectId = this.targetProjectId;
      if (this.targetProjectId != null) {
        this.component.targetProjectDoc$.next({ id: this.targetProjectId } as SFProjectDoc);
      }
      this.component.selectedParatextProject = this.selectedParatextProject;
      this.component.availableBooksForImport = this.availableBooksForImport;
      this.component.booksWithExistingText = this.booksWithExistingText;
      this.component.importProgress = this.importProgress;

      // Move the stepper to the specified step
      if (this.component.stepper && this.component.stepper.selectedIndex !== this.step) {
        this.component.stepper.reset();
        for (let i = 0; i < this.step - 1; i++) {
          const step = this.component.stepper.steps.get(i);
          if (step != null) step.completed = true;
          this.component.stepper.next();
        }
      }
    });
  }
}

interface DraftImportWizardComponentState {
  online: boolean;
  step: number;
  canEditProject: boolean;
  importComplete: boolean;
  importStepTriggered: boolean;
  isConnecting: boolean;
  isImporting: boolean;
  isLoadingProject: boolean;
  isLoadingProjects: boolean;
  isSyncing: boolean;
  needsConnection: boolean;
  projectLoadingFailed: boolean;
  showBookSelection: boolean;
  showOverwriteConfirmation: boolean;
  skipSync: boolean;
  syncComplete: boolean;
  connectionError?: string;
  importError?: string;
  targetProjectId?: string;
  selectedParatextProject?: ParatextProject;
  availableBooksForImport: BookForImport[];
  booksWithExistingText: BookWithExistingText[];
  importProgress: ImportProgress[];
}

const defaultArgs: DraftImportWizardComponentState = {
  online: true,
  step: 0,
  canEditProject: true,
  importComplete: false,
  importStepTriggered: false,
  isConnecting: false,
  isImporting: false,
  isLoadingProject: false,
  isLoadingProjects: false,
  isSyncing: false,
  needsConnection: false,
  projectLoadingFailed: false,
  showBookSelection: false,
  showOverwriteConfirmation: false,
  skipSync: false,
  syncComplete: false,
  connectionError: undefined,
  importError: undefined,
  targetProjectId: undefined,
  selectedParatextProject: undefined,
  availableBooksForImport: [],
  booksWithExistingText: [],
  importProgress: []
};

const buildDto: BuildDto = {
  additionalInfo: {
    dateFinished: '2026-01-14T15:16:17.18+00:00',
    translationScriptureRanges: [{ projectId: 'P02', scriptureRange: 'GEN;EXO;LEV;NUM;DEU' }]
  }
} as BuildDto;

export default {
  title: 'Draft/Draft Import Wizard Dialog',
  component: DraftImportWizardWrapperComponent,
  decorators: [
    moduleMetadata({
      imports: [DraftImportWizardComponent, DraftImportWizardWrapperComponent],
      providers: [
        { provide: DestroyRef, useValue: instance(mockDestroyRef) },
        { provide: MAT_DIALOG_DATA, useValue: buildDto },
        { provide: MatDialogRef, useValue: instance(mockMatDialogRef) },
        { provide: ParatextService, useValue: instance(mockParatextService) },
        { provide: ProjectNotificationService, useValue: instance(mockProjectNotificationService) },
        { provide: SFProjectService, useValue: instance(mockProjectService) },
        { provide: TextDocService, useValue: instance(mockTextDocService) },
        { provide: OnlineStatusService, useValue: instance(mockOnlineStatusService) },
        { provide: ActivatedProjectService, useValue: instance(mockActivatedProjectService) },
        { provide: ProgressService, useValue: instance(mockProgressService) },
        { provide: AuthService, useValue: instance(mockAuthService) },
        defaultTranslocoMarkupTranspilers()
      ]
    })
  ],
  render: args => {
    setUpMocks(args);
    return {
      component: DraftImportWizardWrapperComponent,
      props: args
    };
  },
  args: defaultArgs,
  parameters: {
    controls: {
      include: Object.keys(defaultArgs)
    }
  },
  argTypes: {
    online: { control: 'boolean' },
    canEditProject: { control: 'boolean' },
    importComplete: { control: 'boolean' },
    importStepTriggered: { control: 'boolean' },
    isConnecting: { control: 'boolean' },
    isImporting: { control: 'boolean' },
    isLoadingProject: { control: 'boolean' },
    isLoadingProjects: { control: 'boolean' },
    isSyncing: { control: 'boolean' },
    needsConnection: { control: 'boolean' },
    projectLoadingFailed: { control: 'boolean' },
    showBookSelection: { control: 'boolean' },
    showOverwriteConfirmation: { control: 'boolean' },
    skipSync: { control: 'boolean' },
    syncComplete: { control: 'boolean' },
    connectionError: { control: 'text' },
    importError: { control: 'text' },
    targetProjectId: { control: 'text' },
    selectedParatextProject: { control: 'object' },
    availableBooksForImport: { control: 'object' },
    booksWithExistingText: { control: 'object' },
    importProgress: { control: 'object' },
    step: { control: 'number' }
  }
} as Meta<DraftImportWizardComponentState>;

type Story = StoryObj<DraftImportWizardWrapperComponent>;

const Template: Story = {};

export const StepOne: Story = {
  ...Template
};

export const StepTwo: Story = {
  ...Template,
  args: {
    ...defaultArgs,
    needsConnection: true,
    step: 2,
    selectedParatextProject: { shortName: 'P01', name: 'Project 01' } as ParatextProject
  }
};

export const StepThree: Story = {
  ...Template,
  args: {
    ...defaultArgs,
    isConnecting: true,
    needsConnection: true,
    step: 3,
    selectedParatextProject: { shortName: 'P01', name: 'Project 01' } as ParatextProject
  }
};

export const StepFour: Story = {
  ...Template,
  args: {
    ...defaultArgs,
    needsConnection: true,
    showBookSelection: true,
    step: 4,
    selectedParatextProject: { shortName: 'P01', name: 'Project 01' } as ParatextProject,
    availableBooksForImport: [
      getBookForImport(1, true),
      getBookForImport(2, true),
      getBookForImport(3, true),
      getBookForImport(4, true),
      getBookForImport(5, false)
    ]
  }
};

export const StepFive: Story = {
  ...Template,
  args: {
    ...defaultArgs,
    isConnecting: false,
    needsConnection: true,
    showBookSelection: true,
    showOverwriteConfirmation: true,
    step: 5,
    selectedParatextProject: { shortName: 'P01', name: 'Project 01' } as ParatextProject,
    booksWithExistingText: [
      getBookWithExistingText(1, 1),
      getBookWithExistingText(2, 4),
      getBookWithExistingText(3, 7),
      getBookWithExistingText(4, 5),
      getBookWithExistingText(5, 2)
    ]
  }
};

export const StepSix: Story = {
  ...Template,
  args: {
    ...defaultArgs,
    importStepTriggered: true,
    isConnecting: false,
    isImporting: true,
    needsConnection: true,
    showBookSelection: true,
    // Skip the Overwrite Confirmation (step 5)
    step: 5,
    targetProjectId: 'P01',
    selectedParatextProject: { shortName: 'P01', name: 'Project 01' } as ParatextProject,
    // availableBooksForImport is used if importStepTriggered is false
    availableBooksForImport: [
      getBookForImport(1, true),
      getBookForImport(2, true),
      getBookForImport(3, true),
      getBookForImport(4, true),
      getBookForImport(5, false)
    ],
    // importProgress is used if importStepTriggered is true
    importProgress: [
      getImportProgress(1, 1, 1, 0),
      getImportProgress(2, 4, 3, 1),
      getImportProgress(3, 7, 3, 0),
      getImportProgress(4, 5, 0, 0)
    ]
  }
};

export const StepSeven: Story = {
  ...Template,
  args: {
    ...defaultArgs,
    importComplete: true,
    importStepTriggered: true,
    isConnecting: false,
    isImporting: false,
    needsConnection: false,
    showBookSelection: false,
    // Skipping steps 2, 3, 5
    step: 4,
    targetProjectId: 'P01',
    selectedParatextProject: { shortName: 'P01', name: 'Project 01' } as ParatextProject
  }
};

function getBookForImport(bookNum: number, selected: boolean): BookForImport {
  return {
    bookId: Canon.bookNumberToId(bookNum),
    bookNum: bookNum,
    bookName: Canon.bookNumberToEnglishName(bookNum),
    number: bookNum,
    selected: selected
  };
}

function getBookWithExistingText(bookNum: number, numberOfChaptersWithText: number): BookWithExistingText {
  return {
    bookNum: bookNum,
    bookName: Canon.bookNumberToEnglishName(bookNum),
    chaptersWithText: new Array(numberOfChaptersWithText).fill(null).map((_, i) => i + 1)
  };
}

function getImportProgress(
  bookNum: number,
  totalChapters: number,
  numberOfCompletedChapters: number,
  numberOfFailedChapters: number
): ImportProgress {
  return {
    bookNum: bookNum,
    bookId: Canon.bookNumberToId(bookNum),
    bookName: Canon.bookNumberToEnglishName(bookNum),
    totalChapters: totalChapters,
    completedChapters: new Array(numberOfCompletedChapters).fill(null).map((_, i) => i + 1),
    failedChapters: new Array(numberOfFailedChapters)
      .fill(null)
      .map((_, i) => i + 1)
      .map(i => ({
        chapterNum: i
      }))
  };
}

function setUpMocks(args: DraftImportWizardComponentState): void {
  when(mockActivatedProjectService.projectId).thenReturn('P02');
  when(mockOnlineStatusService.onlineStatus$).thenReturn(of(args.online));
  when(mockOnlineStatusService.isOnline).thenReturn(args.online);
  when(mockOnlineStatusService.online).thenReturn(
    new Promise(resolve => {
      if (args.online) resolve();
      // Else, never resolve.
    })
  );
  when(mockProgressService.getProgress(anything(), anything())).thenResolve(
    new ProjectProgress([
      { bookId: 'GEN', verseSegments: 100, blankVerseSegments: 0 },
      { bookId: 'EXO', verseSegments: 100, blankVerseSegments: 0 },
      { bookId: 'LEV', verseSegments: 100, blankVerseSegments: 100 },
      { bookId: 'NUM', verseSegments: 22, blankVerseSegments: 2 },
      { bookId: 'DEU', verseSegments: 0, blankVerseSegments: 0 }
    ])
  );
}
