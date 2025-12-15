import { StepperSelectionEvent } from '@angular/cdk/stepper';
import { AsyncPipe } from '@angular/common';
import { Component, Inject, OnInit, ViewChild } from '@angular/core';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogContent, MatDialogRef } from '@angular/material/dialog';
import { MatError } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatProgressBar } from '@angular/material/progress-bar';
import {
  MatStep,
  MatStepLabel,
  MatStepper,
  MatStepperIcon,
  MatStepperNext,
  MatStepperPrevious
} from '@angular/material/stepper';
import { TranslocoModule } from '@ngneat/transloco';
import { Canon } from '@sillsdev/scripture';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { BehaviorSubject } from 'rxjs';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { I18nService } from 'xforge-common/i18n.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { ParatextProject } from '../../../core/models/paratext-project';
import { SFProjectDoc } from '../../../core/models/sf-project-doc';
import { TextDoc, TextDocId } from '../../../core/models/text-doc';
import { ParatextService } from '../../../core/paratext.service';
import { SFProjectService } from '../../../core/sf-project.service';
import { TextDocService } from '../../../core/text-doc.service';
import { BuildDto } from '../../../machine-api/build-dto';
import { ProjectSelectComponent } from '../../../project-select/project-select.component';
import { BookMultiSelectComponent } from '../../../shared/book-multi-select/book-multi-select.component';
import { NoticeComponent } from '../../../shared/notice/notice.component';
import { CustomValidatorState as CustomErrorState, SFValidators } from '../../../shared/sfvalidators';
import { booksFromScriptureRange } from '../../../shared/utils';
import { SyncProgressComponent } from '../../../sync/sync-progress/sync-progress.component';

/**
 * Represents a book available for import with its draft chapters.
 */
interface BookForImport {
  number: number; // Alias for bookNum to match Book interface
  bookNum: number;
  bookId: string;
  bookName: string;
  chapters: number[];
  selected: boolean;
}

/**
 * Tracks the progress of importing drafts.
 */
interface ImportProgress {
  bookNum: number;
  bookName: string;
  totalChapters: number;
  completedChapters: number;
  failedChapters: { chapter: number; message: string }[];
}

/**
 * Multi-step wizard dialog for importing drafts to a project.
 * Guides users through project selection, optional connection, book selection,
 * overwrite confirmation, import progress, and sync completion.
 */
@Component({
  selector: 'app-draft-import-wizard',
  imports: [
    AsyncPipe,
    FormsModule,
    ReactiveFormsModule,
    MatButton,
    MatCheckbox,
    MatDialogContent,
    MatError,
    MatIcon,
    MatProgressBar,
    MatStep,
    MatStepLabel,
    MatStepper,
    MatStepperIcon,
    MatStepperNext,
    MatStepperPrevious,
    TranslocoModule,
    NoticeComponent,
    ProjectSelectComponent,
    BookMultiSelectComponent,
    SyncProgressComponent
  ],
  templateUrl: './draft-import-wizard.component.html',
  styleUrl: './draft-import-wizard.component.scss'
})
export class DraftImportWizardComponent implements OnInit {
  @ViewChild(MatStepper) stepper?: MatStepper;
  @ViewChild(ProjectSelectComponent) projectSelect?: ProjectSelectComponent;
  @ViewChild('importStep') importStep?: MatStep;

  // Step 1: Project selection
  projectSelectionForm = new FormGroup({
    targetParatextId: new FormControl<string | undefined>(undefined, Validators.required)
  });
  projects: ParatextProject[] = [];
  isLoadingProject = false;
  isLoadingProjects = true;
  targetProjectId?: string;
  selectedParatextProject?: ParatextProject;
  targetProject$ = new BehaviorSubject<SFProjectProfile | undefined>(undefined);
  targetProjectDoc$ = new BehaviorSubject<SFProjectDoc | undefined>(undefined);
  canEditProject = true;
  booksMissingWithoutPermission = false;
  missingBookNames: string[] = [];
  bookCreationError?: string;
  projectLoadingFailed = false;
  private sourceProjectId?: string;
  noDraftsAvailable = false;

  // Step 2-3: Project connection (conditional)
  needsConnection = false;
  isConnecting = false;
  connectionError?: string;

  async connectToProject(skipStepperAdvance: boolean = false): Promise<void> {
    const paratextId = this.projectSelectionForm.value.targetParatextId;
    if (paratextId == null) {
      this.connectionError = this.i18n.translateStatic('draft_import_wizard.please_select_valid_project');
      return;
    }

    if (this.isConnecting) {
      return;
    }

    if (!skipStepperAdvance) {
      this.stepper?.next();
    }

    this.connectionError = undefined;
    this.isConnecting = true;

    const paratextProject = this.projects.find(p => p.paratextId === paratextId);
    if (paratextProject == null) {
      this.connectionError = this.i18n.translateStatic('draft_import_wizard.please_select_valid_project');
      this.isConnecting = false;
      return;
    }

    try {
      if (this.targetProjectId != null) {
        // SF project exists, just add user to it
        await this.projectService.onlineAddCurrentUser(this.targetProjectId);

        // Reload project data after connection
        const projectDoc = await this.projectService.get(this.targetProjectId);
        this.targetProjectDoc$.next(projectDoc);
        if (projectDoc.data != null) {
          await this.analyzeTargetProject(projectDoc.data, paratextProject.isConnected);
        }

        try {
          await this.analyzeBooksForOverwrite();
        } catch (analysisError) {
          console.error('Failed to analyze books for overwrite', analysisError);
        }

        this.isConnecting = false;
        this.stepper?.next();
      } else {
        // Create SF project for this Paratext project
        this.targetProjectId = await this.projectService.onlineCreate({
          paratextId: paratextId,
          sourceParatextId: null,
          checkingEnabled: false
        });

        // updateConnectStatus() will handle the sync finishing and move to the next step after "connecting"
        this.stepper?.next();

        if (this.targetProjectId != null) {
          const projectDoc = await this.projectService.get(this.targetProjectId);
          this.targetProjectDoc$.next(projectDoc);
        }
      }
    } catch (error) {
      this.connectionError =
        error instanceof Error && error.message.length > 0
          ? error.message
          : this.i18n.translateStatic('draft_import_wizard.failed_to_connect_project');
      this.isConnecting = false;
    }
  }

  retryProjectConnection(): void {
    void this.connectToProject(true);
  }

  updateConnectStatus(inProgress: boolean): void {
    if (!inProgress) {
      const projectDoc = this.targetProjectDoc$.value;
      if (projectDoc?.data == null) {
        this.isConnecting = false;
        return;
      }

      void this.analyzeTargetProject(projectDoc.data, false)
        .then(async () => {
          try {
            return await this.analyzeBooksForOverwrite();
          } catch (analysisError) {
            console.error('Failed to analyze books for overwrite', analysisError);
          }
        })
        .finally(() => {
          this.isConnecting = false;
        });
    }
  }

  updateSyncStatus(inProgress: boolean): void {
    if (!inProgress) this.syncComplete = true;
  }

  onStepSelectionChange(event: StepperSelectionEvent): void {
    if (event.selectedStep === this.importStep && !this.importStepTriggered) {
      if (this.noDraftsAvailable) {
        return;
      }
      this.importStepTriggered = true;
      void this.startImport();
    }
  }

  // Step 4: Book Selection (conditional)
  availableBooksForImport: BookForImport[] = [];
  showBookSelection = false;

  // Step 5: Overwrite confirmation (conditional)
  showOverwriteConfirmation = false;
  overwriteForm = new FormGroup({
    confirmOverwrite: new FormControl(false, Validators.requiredTrue)
  });
  booksWithExistingText: { bookNum: number; bookName: string; chaptersWithText: number[] }[] = [];

  // Step 6: Import progress
  isImporting = false;
  importProgress: ImportProgress[] = [];
  importError?: string;
  importComplete = false;
  private importStepTriggered = false;

  // Step 7: Sync confirmation and completion
  showSyncConfirmation = false;
  isSyncing = false;
  syncError?: string;
  syncComplete = false;
  skipSync = false;

  invalidMessageMapper: { [key: string]: string } = {};

  constructor(
    @Inject(MAT_DIALOG_DATA) readonly data: BuildDto,
    @Inject(MatDialogRef) private readonly dialogRef: MatDialogRef<DraftImportWizardComponent, boolean>,
    private readonly paratextService: ParatextService,
    private readonly projectService: SFProjectService,
    private readonly textDocService: TextDocService,
    readonly i18n: I18nService,
    private readonly onlineStatusService: OnlineStatusService,
    private readonly activatedProjectService: ActivatedProjectService
  ) {}

  get isAppOnline(): boolean {
    return this.onlineStatusService.isOnline;
  }

  get availableBooksFromBuild(): number[] {
    const translationRanges = this.data.additionalInfo?.translationScriptureRanges ?? [];
    const bookNumbers = translationRanges.flatMap(range => booksFromScriptureRange(range.scriptureRange));
    return Array.from(new Set(bookNumbers));
  }

  private _selectedBooks: BookForImport[] = [];
  get selectedBooks(): BookForImport[] {
    const value = this.availableBooksForImport.filter(b => b.selected);
    if (this._selectedBooks.toString() !== value.toString()) {
      this._selectedBooks = value;
    }

    return this._selectedBooks;
  }

  private getBooksToImport(): BookForImport[] {
    return this.showBookSelection ? this.selectedBooks : this.availableBooksForImport;
  }

  get singleBookName(): string {
    if (this.booksWithExistingText.length === 1) {
      return this.booksWithExistingText[0].bookName;
    }
    return '';
  }

  ngOnInit(): void {
    this.setupInvalidMessageMapper();
    void this.loadProjects();
    this.initializeAvailableBooks();
    void this.loadSourceProjectContext();
  }

  private setupInvalidMessageMapper(): void {
    this.invalidMessageMapper = {
      invalidProject: this.i18n.translateStatic('draft_import_wizard.please_select_valid_project'),
      bookNotFound: this.i18n.translateStatic('draft_import_wizard.book_does_not_exist'),
      noWritePermissions: this.i18n.translateStatic('draft_import_wizard.no_write_permissions')
    };
  }

  private async loadProjects(): Promise<void> {
    try {
      const allProjects = await this.paratextService.getProjects();
      // Filter to show only connectable projects (already have SF project or user is PT admin)
      this.projects = this.filterConnectable(allProjects);
      this.projectLoadingFailed = false;
    } catch (error) {
      this.projectLoadingFailed = true;
      this.projects = [];
      console.error('Failed to load projects:', error);
    } finally {
      this.isLoadingProjects = false;
    }
  }

  reloadProjects(): void {
    if (this.isLoadingProjects) {
      return;
    }
    this.isLoadingProjects = true;
    this.projectLoadingFailed = false;
    void this.loadProjects();
  }

  /**
   * From the given paratext projects, returns those that either:
   * - already have a corresponding SF project
   * - or have current user as admin on the PT project
   */
  private filterConnectable(projects: ParatextProject[] | undefined): ParatextProject[] {
    return projects?.filter(project => project.projectId != null || project.isConnectable) ?? [];
  }

  private initializeAvailableBooks(): void {
    const bookNums = this.availableBooksFromBuild;
    this.availableBooksForImport = bookNums.map(bookNum => ({
      number: bookNum, // Alias for compatibility with Book interface
      bookNum,
      bookId: Canon.bookNumberToId(bookNum),
      bookName: this.i18n.localizeBook(bookNum),
      chapters: [], // Will be populated when we have project context
      selected: true // Pre-select all books by default
    }));

    // Show book selection only if multiple books
    this.showBookSelection = this.availableBooksForImport.length > 1;
  }

  private async loadSourceProjectContext(): Promise<void> {
    this.sourceProjectId = this.activatedProjectService.projectId;
    if (this.sourceProjectId == null) {
      this.noDraftsAvailable = this.availableBooksForImport.length === 0;
      return;
    }
  }

  async applyDraftToProject(projectId: string): Promise<void> {
    // TODO: Use this function!
    // Build a scripture range and timestamp to import
    const scriptureRange = this.availableBooksForImport.map(b => b.bookId).join(';');
    const timestamp: Date =
      this.data.additionalInfo?.dateGenerated != null ? new Date(this.data.additionalInfo.dateGenerated) : new Date();

    // Apply the pre-translation draft to the project
    await this.projectService.onlineApplyPreTranslationToProject(
      this.activatedProjectService.projectId!,
      scriptureRange,
      projectId,
      timestamp
    );

    // TODO: Subscribe to SignalR for import status/updates
    this.resetImportState();
  }

  async projectSelected(paratextId: string): Promise<void> {
    if (paratextId == null) {
      this.targetProject$.next(undefined);
      this.targetProjectDoc$.next(undefined);
      this.selectedParatextProject = undefined;
      this.resetProjectValidation();
      this.resetImportState();
      return;
    }

    const paratextProject = this.projects.find(p => p.paratextId === paratextId);
    if (paratextProject == null) {
      this.canEditProject = false;
      this.booksMissingWithoutPermission = false;
      this.bookCreationError = undefined;
      this.missingBookNames = [];
      this.targetProject$.next(undefined);
      this.targetProjectDoc$.next(undefined);
      this.selectedParatextProject = undefined;
      await this.validateProject();
      this.resetImportState();
      return;
    }

    this.selectedParatextProject = paratextProject;
    this.resetProjectValidation();
    this.resetImportState();

    // Determine if we need to create SF project or connect to existing one
    if (paratextProject.projectId != null) {
      // SF project exists
      this.targetProjectId = paratextProject.projectId;
      this.needsConnection = !paratextProject.isConnected;

      // Get the project profile to analyze
      this.isLoadingProject = true;
      try {
        const projectDoc = await this.projectService.getProfile(this.targetProjectId);
        if (projectDoc.data != null) {
          await this.analyzeTargetProject(projectDoc.data, paratextProject.isConnected);
        }
      } finally {
        this.isLoadingProject = false;
      }
    } else {
      // Need to create SF project - this will happen after connection step
      this.isLoadingProject = true;
      try {
        this.targetProjectId = undefined;
        this.needsConnection = true;
        this.canEditProject = paratextProject.isConnectable;
        this.targetProject$.next(undefined);
        this.targetProjectDoc$.next(undefined);
        await this.validateProject();
      } finally {
        this.isLoadingProject = false;
      }
    }
  }

  private async analyzeTargetProject(project: SFProjectProfile, isConnected: boolean): Promise<void> {
    // Check permissions for all books
    this.canEditProject = this.textDocService.userHasGeneralEditRight(project);

    // Connection status comes from ParatextProject
    this.needsConnection = !isConnected && this.canEditProject;

    if (this.canEditProject && this.targetProjectId != null) {
      this.targetProject$.next(project);
      // Load the full project doc for sync component
      const projectDoc = await this.projectService.get(this.targetProjectId);
      this.targetProjectDoc$.next(projectDoc);
    } else {
      this.targetProject$.next(undefined);
      this.targetProjectDoc$.next(undefined);
    }

    await this.validateProject();
  }

  private async ensureSelectedBooksExist(): Promise<boolean> {
    if (this.targetProjectId == null) {
      return false;
    }

    let project = this.targetProject$.value;
    if (project == null) {
      const profileDoc = await this.projectService.getProfile(this.targetProjectId);
      project = profileDoc.data ?? undefined;
      if (project != null) {
        this.targetProject$.next(project);
      } else {
        return false;
      }
    }

    const booksToImport = this.getBooksToImport();
    const missingBooks: BookForImport[] = booksToImport.filter(book =>
      project.texts.every(text => text.bookNum !== book.bookNum)
    );

    this.missingBookNames = missingBooks.map(book => book.bookName);

    if (missingBooks.length === 0) {
      this.booksMissingWithoutPermission = false;
      this.bookCreationError = undefined;
      return true;
    }

    const canCreateBooks = this.textDocService.userHasGeneralEditRight(project);
    if (!canCreateBooks) {
      this.booksMissingWithoutPermission = true;
      const booksDescription = this.missingBookNames.length > 0 ? ` (${this.missingBookNames.join(', ')})` : '';
      this.bookCreationError = this.i18n.translateStatic('draft_import_wizard.books_missing_no_permission', {
        booksDescription
      });
      await this.validateProject();
      return false;
    }

    this.booksMissingWithoutPermission = false;
    this.bookCreationError = undefined;
    return true;
  }

  private resetProjectValidation(): void {
    this.canEditProject = true;
    this.booksMissingWithoutPermission = false;
    this.bookCreationError = undefined;
    this.missingBookNames = [];
  }

  private async validateProject(): Promise<void> {
    await new Promise<void>(resolve => {
      setTimeout(() => {
        this.projectSelect?.customValidate(SFValidators.customValidator(this.getCustomErrorState()));
        resolve();
      });
    });
  }

  private getCustomErrorState(): CustomErrorState {
    if (!this.projectSelectionForm.controls.targetParatextId.valid) {
      return CustomErrorState.InvalidProject;
    }
    if (this.booksMissingWithoutPermission) {
      return CustomErrorState.BookNotFound;
    }
    if (!this.canEditProject) {
      return CustomErrorState.NoWritePermissions;
    }
    return CustomErrorState.None;
  }

  onBookSelect(selectedBooks: number[]): void {
    for (const book of this.availableBooksForImport) {
      book.selected = selectedBooks.includes(book.bookNum);
    }
    this.resetImportState();
    this.booksMissingWithoutPermission = false;
    this.bookCreationError = undefined;
    this.missingBookNames = [];
    void this.analyzeBooksForOverwrite();
    void this.validateProject();
  }

  async advanceFromProjectSelection(): Promise<void> {
    if (!this.projectSelectionForm.valid) {
      return;
    }

    if (this.noDraftsAvailable) {
      return;
    }

    // If project needs connection, advance to connection step (targetProjectId may be undefined)
    if (this.needsConnection) {
      this.stepper?.next();
      return;
    }

    // For connected projects, ensure we have a targetProjectId before proceeding
    if (this.targetProjectId == null) {
      return;
    }

    const booksReady = await this.ensureSelectedBooksExist();
    if (!booksReady) {
      return;
    }

    // Analyze books for overwrite confirmation
    await this.analyzeBooksForOverwrite();

    this.stepper?.next();
  }

  private async analyzeBooksForOverwrite(): Promise<void> {
    if (this.targetProjectId == null) return;

    this.booksWithExistingText = [];
    const booksToCheck = this.getBooksToImport();

    for (const book of booksToCheck) {
      const chaptersWithText = await this.getChaptersWithText(book.bookNum);
      if (chaptersWithText.length > 0) {
        this.booksWithExistingText.push({
          bookNum: book.bookNum,
          bookName: book.bookName,
          chaptersWithText
        });
      }
    }

    this.showOverwriteConfirmation = this.booksWithExistingText.length > 0;
  }

  private async getChaptersWithText(bookNum: number): Promise<number[]> {
    if (this.targetProjectId == null) return [];

    const project = this.targetProject$.value;
    if (project == null) return [];

    const targetBook = project.texts.find(t => t.bookNum === bookNum);
    if (targetBook == null) return [];

    const chaptersWithText: number[] = [];
    for (const chapter of targetBook.chapters) {
      const textDocId = new TextDocId(this.targetProjectId, bookNum, chapter.number);
      const hasText = await this.hasTextInChapter(textDocId);
      if (hasText) {
        chaptersWithText.push(chapter.number);
      }
    }

    return chaptersWithText;
  }

  private async hasTextInChapter(textDocId: TextDocId): Promise<boolean> {
    const textDoc: TextDoc = await this.projectService.getText(textDocId);
    return textDoc.getNonEmptyVerses().length > 0;
  }

  async startImport(): Promise<void> {
    this.importStepTriggered = true;
    if (this.targetProjectId == null || this.sourceProjectId == null) {
      this.importError = this.i18n.translateStatic('draft_import_wizard.project_context_unavailable');
      return;
    }

    this.isImporting = true;
    this.importError = undefined;
    this.importComplete = false;

    const booksToImport = this.getBooksToImport().filter(book => book.selected);

    if (booksToImport.length === 0) {
      this.isImporting = false;
      this.importError = this.i18n.translateStatic('draft_import_wizard.no_books_ready_for_import');
      return;
    }

    // Initialize progress tracking
    this.importProgress = booksToImport.map(book => ({
      bookNum: book.bookNum,
      bookName: book.bookName,
      totalChapters: book.chapters.length,
      completedChapters: 0,
      failedChapters: []
    }));

    try {
      await this.performImport(booksToImport);

      // Check if there were any failures
      const totalFailures = this.importProgress.reduce((sum, p) => sum + p.failedChapters.length, 0);
      if (totalFailures > 0) {
        this.importError = `Failed to import ${totalFailures} chapter(s). See details above.`;
      } else {
        this.importComplete = true;
      }
    } catch (error) {
      this.importError = error instanceof Error ? error.message : 'Unknown error occurred';
    } finally {
      this.isImporting = false;
    }
  }

  private async performImport(_books: BookForImport[]): Promise<void> {
    if (this.targetProjectId == null || this.sourceProjectId == null) {
      throw new Error('Missing project context for import');
    }

    // TODO: Generate a scripture range
    // TODO: Get timestamp
    /*
         let timestamp: Date | undefined;
          if (this.data.additionalInfo?.dateGenerated != null) {
            timestamp = new Date(this.data.additionalInfo.dateGenerated);
          }
    */
    // TODO: Submit to the backend
    // TODO: Update this.progress.failedChapters
    // TODO: Update this.progress.completedChapters
  }

  retryImport(): void {
    this.resetImportState();
    void this.startImport();
  }

  async selectSync(): Promise<void> {
    this.skipSync = false;
    await this.performSync();
  }

  selectSkipSync(): void {
    this.skipSync = true;
    this.stepper?.next();
  }

  private async performSync(): Promise<void> {
    if (this.targetProjectId == null) return;

    this.isSyncing = true;
    this.syncError = undefined;

    try {
      await this.projectService.onlineSync(this.targetProjectId);
      this.stepper?.next();
    } catch (error) {
      this.syncError = error instanceof Error ? error.message : 'Sync failed';
    } finally {
      this.isSyncing = false;
    }
  }

  retrySync(): void {
    this.syncError = undefined;
    void this.performSync();
  }

  close(): void {
    this.dialogRef.close(this.importComplete);
  }

  cancel(): void {
    this.dialogRef.close(false);
  }

  getFailedChapters(progress: ImportProgress): string {
    return progress.failedChapters.map(f => f.chapter).join(', ');
  }

  private resetImportState(): void {
    this.isImporting = false;
    this.importProgress = [];
    this.importError = undefined;
    this.importComplete = false;
    this.importStepTriggered = false;
  }
}
