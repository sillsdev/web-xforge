import { StepperSelectionEvent } from '@angular/cdk/stepper';
import { AsyncPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, Inject, OnInit, ViewChild } from '@angular/core';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogContent, MatDialogRef } from '@angular/material/dialog';
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
import { BehaviorSubject } from 'rxjs';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { AuthService } from 'xforge-common/auth.service';
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
import { booksFromScriptureRange } from '../../../shared/utils';
import { SyncProgressComponent } from '../../../sync/sync-progress/sync-progress.component';
import { DraftNotificationService } from '../draft-notification.service';

/**
 * Represents a book available for import with its draft chapters.
 */
export interface BookForImport {
  number: number; // Alias for bookNum to match Book interface
  bookNum: number;
  bookId: string;
  bookName: string;
  selected: boolean;
}

/**
 * A book that the user will be prompted to overwrite.
 */
export interface BookWithExistingText {
  bookNum: number;
  bookName: string;
  chaptersWithText: number[];
}

/**
 * Tracks the progress of importing drafts.
 */
export interface ImportProgress {
  bookNum: number;
  bookId: string;
  bookName: string;
  totalChapters: number;
  completedChapters: number[];
  failedChapters: { chapterNum: number; message?: string }[];
}

export interface DraftApplyState {
  bookNum: number;
  chapterNum: number;
  totalChapters: number;
  message?: string;
  status: DraftApplyStatus;
}

export enum DraftApplyStatus {
  None = 0,
  InProgress = 1,
  Successful = 2,
  Warning = 3,
  Failed = 4
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
  targetProjectDoc$ = new BehaviorSubject<SFProjectDoc | undefined>(undefined);
  canEditProject = true;
  projectLoadingFailed = false;
  sourceProjectId?: string;
  cannotAdvanceFromProjectSelection = false;

  // Step 2-3: Project connection (conditional)
  private _isConnecting = false;
  public get isConnecting(): boolean {
    return this._isConnecting;
  }
  public set isConnecting(value: boolean) {
    this.dialogRef.disableClose = value;
    this._isConnecting = value;
  }

  needsConnection = false;
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
        await this.loadTargetProjectAndValidate(projectDoc);

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

        const projectDoc = await this.projectService.get(this.targetProjectId);
        this.targetProjectDoc$.next(projectDoc);
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
      void this.loadTargetProjectAndValidate(projectDoc).finally(() => {
        this.isConnecting = false;
      });
    }
  }

  updateSyncStatus(inProgress: boolean): void {
    if (!inProgress && this.isSyncing) {
      this.isSyncing = false;
      this.syncComplete = true;
    }
  }

  onStepSelectionChange(event: StepperSelectionEvent): void {
    if (event.selectedStep === this.importStep && !this.importStepTriggered) {
      this.importStepTriggered = true;
      void this.startImport();
    }
  }

  // Step 4: Book Selection (conditional)
  availableBooksForImport: BookForImport[] = [];
  showBookSelection = false;

  // Step 5: Overwrite confirmation (conditional)
  showOverwriteConfirmation = true;
  overwriteForm = new FormGroup({
    confirmOverwrite: new FormControl(false, Validators.requiredTrue)
  });
  booksWithExistingText: BookWithExistingText[] = [];

  // Step 6: Import progress
  private _isImporting = false;
  public get isImporting(): boolean {
    return this._isImporting;
  }
  public set isImporting(value: boolean) {
    this.dialogRef.disableClose = value;
    this._isImporting = value;
  }

  importProgress: ImportProgress[] = [];
  importError?: string;
  importComplete = false;
  importStepTriggered = false;

  // Step 7: Sync confirmation and completion
  showSyncConfirmation = false;
  isSyncing = false;
  syncError?: string;
  syncComplete = false;
  skipSync = false;

  private readonly notifyDraftApplyProgressHandler = (projectId: string, draftApplyState: DraftApplyState): void => {
    this.updateDraftApplyState(projectId, draftApplyState);
  };

  constructor(
    @Inject(MAT_DIALOG_DATA) readonly data: BuildDto,
    @Inject(MatDialogRef) private readonly dialogRef: MatDialogRef<DraftImportWizardComponent, boolean>,
    readonly destroyRef: DestroyRef,
    private readonly paratextService: ParatextService,
    private readonly draftNotificationService: DraftNotificationService,
    private readonly projectService: SFProjectService,
    private readonly textDocService: TextDocService,
    readonly i18n: I18nService,
    private readonly onlineStatusService: OnlineStatusService,
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly authService: AuthService
  ) {
    this.draftNotificationService.setNotifyDraftApplyProgressHandler(this.notifyDraftApplyProgressHandler);
    destroyRef.onDestroy(async () => {
      // Stop the SignalR connection when the component is destroyed
      await draftNotificationService.stop();
      this.draftNotificationService.removeNotifyDraftApplyProgressHandler(this.notifyDraftApplyProgressHandler);
    });
  }

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
    void this.loadProjects();
    this.initializeAvailableBooks();
    this.sourceProjectId = this.activatedProjectService.projectId;
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
      if (error instanceof HttpErrorResponse && error.status === 401) {
        this.authService.requestParatextCredentialUpdate();
      }
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
      selected: true // Pre-select all books by default
    }));

    // Show book selection only if multiple books
    this.showBookSelection = this.availableBooksForImport.length > 1;
  }

  async projectSelected(paratextId: string): Promise<void> {
    if (paratextId == null) {
      this.targetProjectDoc$.next(undefined);
      this.selectedParatextProject = undefined;
      this.resetProjectValidation();
      this.resetImportState();
      return;
    }

    const paratextProject = this.projects.find(p => p.paratextId === paratextId);
    if (paratextProject == null) {
      this.canEditProject = false;
      this.targetProjectDoc$.next(undefined);
      this.selectedParatextProject = undefined;
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

      // If the project still needs connection, we will analyze after connecting
      if (!this.needsConnection) {
        // Get the project profile to analyze
        this.isLoadingProject = true;
        try {
          const projectDoc = await this.projectService.get(this.targetProjectId);
          await this.loadTargetProjectAndValidate(projectDoc);
        } finally {
          this.isLoadingProject = false;
        }
      }
    } else {
      // Need to create SF project - this will happen after connection step
      this.isLoadingProject = true;
      try {
        this.targetProjectId = undefined;
        this.needsConnection = true;
        this.canEditProject = paratextProject.isConnectable;
        this.targetProjectDoc$.next(undefined);
      } finally {
        this.isLoadingProject = false;
      }
    }
  }

  private async loadTargetProjectAndValidate(projectDoc: SFProjectDoc): Promise<void> {
    // Check permissions for all books
    this.canEditProject = this.textDocService.userHasGeneralEditRight(projectDoc?.data);
    if (this.canEditProject) {
      this.targetProjectDoc$.next(projectDoc);
    } else {
      this.targetProjectDoc$.next(undefined);
    }

    await this.analyzeBooksForOverwriteConfirmation();
  }

  private async ensureProjectExists(): Promise<boolean> {
    if (this.targetProjectId == null) {
      return false;
    }

    if (this.targetProjectDoc$.value?.data == null) {
      const profileDoc = await this.projectService.get(this.targetProjectId);
      if (profileDoc?.data == null) {
        return false;
      }
      this.targetProjectDoc$.next(profileDoc);
    }

    return true;
  }

  private resetProjectValidation(): void {
    this.canEditProject = true;
  }

  onBookSelect(selectedBooks: number[]): void {
    for (const book of this.availableBooksForImport) {
      book.selected = selectedBooks.includes(book.bookNum);
    }
    this.resetImportState();
    void this.analyzeBooksForOverwriteConfirmation();
  }

  get projectReadyToImport(): boolean {
    return this.projectSelectionForm.valid && !this.isConnecting && !this.isImporting && !this.isLoadingProject;
  }

  async advanceFromProjectSelection(): Promise<void> {
    if (!this.projectReadyToImport) {
      this.cannotAdvanceFromProjectSelection = true;
      return;
    } else {
      this.cannotAdvanceFromProjectSelection = false;
    }

    // If project needs connection, advance to connection step (targetProjectId may be undefined)
    if (this.needsConnection) {
      this.stepper?.next();
      return;
    }

    // For connected projects, ensure we have a targetProjectId before proceeding
    if (this.targetProjectId == null) {
      this.cannotAdvanceFromProjectSelection = true;
      return;
    }

    this.isLoadingProject = true;
    const projectExists = await this.ensureProjectExists();
    if (!projectExists) {
      this.isLoadingProject = false;
      return;
    }

    await this.analyzeBooksForOverwriteConfirmation();

    this.stepper?.next();
    this.isLoadingProject = false;
  }

  private async analyzeBooksForOverwriteConfirmation(): Promise<void> {
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

    const project = this.targetProjectDoc$.value?.data;
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
      bookId: book.bookId,
      bookName: book.bookName,
      totalChapters: 0,
      completedChapters: [],
      failedChapters: []
    }));

    try {
      await this.performImport(booksToImport);
    } catch (error) {
      this.importError = error instanceof Error ? error.message : 'Unknown error occurred';
      this.isImporting = false;
    }
  }

  private async performImport(books: BookForImport[]): Promise<void> {
    if (this.targetProjectId == null || this.sourceProjectId == null) {
      throw new Error('Missing project context for import');
    }

    // Subscribe to SignalR updates
    await this.draftNotificationService.start();
    await this.draftNotificationService.subscribeToProject(this.sourceProjectId);

    // Build a scripture range and timestamp to import
    const scriptureRange = books.map(b => b.bookId).join(';');
    const timestamp: Date =
      this.data.additionalInfo?.dateGenerated != null ? new Date(this.data.additionalInfo.dateGenerated) : new Date();

    // Apply the pre-translation draft to the project
    await this.projectService.onlineApplyPreTranslationToProject(
      this.sourceProjectId,
      scriptureRange,
      this.targetProjectId,
      timestamp
    );
  }

  /**
   * Handler for SignalR notifications when applying a draft.
   *
   * @param projectId The project identifier.
   * @param draftApplyState The draft apply state from the backend.
   */
  updateDraftApplyState(projectId: string, draftApplyState: DraftApplyState): void {
    if (projectId !== this.sourceProjectId) return;

    // Update based on book or chapter
    if (draftApplyState.bookNum === 0 && draftApplyState.chapterNum === 0) {
      // Handle the final states
      if (draftApplyState.status === DraftApplyStatus.Successful) {
        // Check if there were any failures
        this.isImporting = false;
        const totalFailures = this.importProgress.reduce((sum, p) => sum + p.failedChapters.length, 0);
        if (totalFailures > 0) {
          this.importError = `Failed to import ${totalFailures} chapter(s). See details above.`;
        } else {
          this.importComplete = true;
        }
      } else if (draftApplyState.status === DraftApplyStatus.Failed) {
        // Clear all completed chapters
        this.importProgress.forEach(p => {
          p.completedChapters.length = 0;
        });
        this.isImporting = false;
        this.importError = draftApplyState.message;
        const totalFailures = this.importProgress.reduce((sum, p) => sum + p.failedChapters.length, 0);
        if (totalFailures > 0 && (this.importError == null || this.importError.length === 0)) {
          this.importError = `Failed to import ${totalFailures} chapter(s). See details above.`;
        }
      }
    } else if (draftApplyState.bookNum > 0) {
      // Handle the in-progress states
      const progress: ImportProgress | undefined = this.importProgress.find(p => p.bookNum === draftApplyState.bookNum);
      if (progress != null) {
        if (draftApplyState.status === DraftApplyStatus.Failed) {
          const failedChapter = progress.failedChapters.find(c => c.chapterNum === draftApplyState.chapterNum);
          if (failedChapter != null && draftApplyState.message != null) {
            failedChapter.message = draftApplyState.message;
          } else {
            progress.failedChapters.push({ chapterNum: draftApplyState.chapterNum, message: draftApplyState.message });
          }
        } else if (
          draftApplyState.status === DraftApplyStatus.Successful &&
          !progress.completedChapters.includes(draftApplyState.chapterNum)
        ) {
          progress.completedChapters.push(draftApplyState.chapterNum);
        } else if (draftApplyState.status === DraftApplyStatus.InProgress && draftApplyState.totalChapters > 0) {
          progress.totalChapters = draftApplyState.totalChapters;
        }
      }
    }
  }

  clearImport(): void {
    this.resetImportState();
    this.stepper?.previous();
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

    this.syncError = undefined;

    try {
      this.stepper?.next();
      await this.projectService.onlineSync(this.targetProjectId);
      this.isSyncing = true;
    } catch (error) {
      this.syncError = error instanceof Error ? error.message : 'Sync failed';
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
    const failedChapters: number[] = progress.failedChapters.filter(f => f.chapterNum !== 0).map(f => f.chapterNum);
    if (!progress.failedChapters.some(f => f.chapterNum === 0)) {
      // A subset of chapters failed
      return failedChapters.join(', ');
    } else if (progress.totalChapters > 1) {
      // All chapters failed, so display as a range
      return `1-${progress.totalChapters}`;
    } else {
      // The only chapter in the book failed
      return `${progress.totalChapters}`;
    }
  }

  private resetImportState(): void {
    this.isImporting = false;
    this.importProgress = [];
    this.importError = undefined;
    this.importComplete = false;
    this.importStepTriggered = false;
  }
}
