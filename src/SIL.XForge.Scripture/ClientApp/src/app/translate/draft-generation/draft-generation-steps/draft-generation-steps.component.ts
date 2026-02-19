import { Component, DestroyRef, EventEmitter, OnInit, Output, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatCard } from '@angular/material/card';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatIcon } from '@angular/material/icon';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatStep, MatStepLabel, MatStepper, MatStepperIcon, MatStepperPrevious } from '@angular/material/stepper';
import {
  MatCell,
  MatCellDef,
  MatColumnDef,
  MatHeaderCell,
  MatHeaderCellDef,
  MatHeaderRow,
  MatHeaderRowDef,
  MatRow,
  MatRowDef,
  MatTable
} from '@angular/material/table';
import { TranslocoModule } from '@ngneat/transloco';
import { Canon } from '@sillsdev/scripture';
import { isEqual } from 'lodash-es';
import { TranslocoMarkupModule } from 'ngx-transloco-markup';
import { TrainingData } from 'realtime-server/lib/esm/scriptureforge/models/training-data';
import {
  DraftConfig,
  ProjectScriptureRange,
  TranslateSource
} from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { combineLatest, merge, Subscription } from 'rxjs';
import { distinctUntilChanged, filter } from 'rxjs/operators';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DialogService } from 'xforge-common/dialog.service';
import { FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { I18nService } from 'xforge-common/i18n.service';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { UserService } from 'xforge-common/user.service';
import { quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { ParatextProject } from '../../../core/models/paratext-project';
import { TrainingDataDoc } from '../../../core/models/training-data-doc';
import { ParatextService } from '../../../core/paratext.service';
import { SFProjectService } from '../../../core/sf-project.service';
import { Book } from '../../../shared/book-multi-select/book-multi-select';
import { BookMultiSelectComponent } from '../../../shared/book-multi-select/book-multi-select.component';
import { NoticeComponent } from '../../../shared/notice/notice.component';
import { BookProgress, ProgressService, ProjectProgress } from '../../../shared/progress-service/progress.service';
import { booksFromScriptureRange, projectLabel } from '../../../shared/utils';
import { NllbLanguageService } from '../../nllb-language.service';
import { ConfirmSourcesComponent } from '../confirm-sources/confirm-sources.component';
import { DraftSource } from '../draft-source';
import { DraftSourcesService } from '../draft-sources.service';
import { TrainingDataService } from '../training-data/training-data.service';

const MIN_TRANSLATED_SEGMENTS_TO_AUTO_SELECT_BOOK = 10 as const;
const MIN_TRANSLATED_SEGMENTS_FOR_NON_EMPTY_BOOK = 3 as const;

export interface DraftGenerationStepsResult {
  trainingDataFiles: string[];
  trainingScriptureRanges: ProjectScriptureRange[];
  translationScriptureRanges?: ProjectScriptureRange[];
  fastTraining: boolean;
  useEcho: boolean;
  sendEmailOnBuildFinished: boolean;
}

export interface TrainingBook extends Book, TrainingPair {}

export interface TrainingGroup extends TrainingPair {
  ranges: string;
}

interface TrainingPair {
  sourceName: string;
}

interface ProjectPendingUpdate {
  projectId: string;
  name: string;
  syncUrl: string;
}

@Component({
  selector: 'app-draft-generation-steps',
  templateUrl: './draft-generation-steps.component.html',
  styleUrls: ['./draft-generation-steps.component.scss'],
  imports: [
    FormsModule,
    NoticeComponent,
    MatButton,
    MatCheckbox,
    MatIcon,
    MatCard,
    MatProgressSpinner,
    MatStepper,
    MatStep,
    MatStepLabel,
    MatStepperIcon,
    MatStepperPrevious,
    MatTable,
    MatColumnDef,
    MatHeaderCell,
    MatHeaderCellDef,
    MatCell,
    MatCellDef,
    MatHeaderRow,
    MatHeaderRowDef,
    MatRow,
    MatRowDef,
    TranslocoModule,
    TranslocoMarkupModule,
    BookMultiSelectComponent,
    ConfirmSourcesComponent
  ]
})
export class DraftGenerationStepsComponent implements OnInit {
  @Output() readonly done = new EventEmitter<DraftGenerationStepsResult>();
  @Output() readonly cancel = new EventEmitter();
  @ViewChild(MatStepper) stepper!: MatStepper;

  projectsPendingUpdate: ProjectPendingUpdate[] = [];

  allAvailableTranslateBooks: Book[] = []; // A flattened instance of the values from availableTranslateBooks
  availableTranslateBooks: { [projectRef: string]: Book[] } = {};
  availableTrainingBooks: { [projectRef: string]: Book[] } = {}; //books in both source and target

  // Unusable books do not exist in the target or corresponding drafting/training source project
  unusableTranslateSourceBooks: number[] = [];
  unusableTranslateTargetBooks: number[] = [];
  emptyTranslateSourceBooks: number[] = [];
  trainingBooksWithoutEnoughData: number[] = [];
  unusableTrainingSourceBooks: number[] = [];
  unusableTrainingTargetBooks: number[] = [];

  draftingSourceProjectName?: string;
  targetProjectName?: string;

  showBookSelectionError = false;
  trainingBooksWereAutoSelected = false;
  isTrainingOptional = false;

  fastTraining: boolean = false;
  useEcho: boolean = false;
  sendEmailOnBuildFinished: boolean = false;

  expandUnusableTranslateBooks = false;
  expandUnusableTrainingBooks = false;
  isStepsCompleted = false;

  protected nextClickedOnLanguageVerification = false;
  protected hasLoaded = false;

  protected draftingSources: DraftSource[] = [];
  protected trainingSources: DraftSource[] = [];
  protected trainingTargets: DraftSource[] = [];
  protected trainingDataFiles: Readonly<TrainingData>[] = [];
  protected isCustomConfigSet = false;

  private trainingDataQuery?: RealtimeQuery<TrainingDataDoc>;
  private trainingDataQuerySubscription?: Subscription;
  private currentUserDoc?: UserDoc;
  private projectProgress: Map<string, ProjectProgress> = new Map<string, ProjectProgress>();

  constructor(
    private readonly destroyRef: DestroyRef,
    protected readonly activatedProject: ActivatedProjectService,
    readonly projectService: SFProjectService,
    private readonly draftSourcesService: DraftSourcesService,
    protected readonly featureFlags: FeatureFlagService,
    private readonly nllbLanguageService: NllbLanguageService,
    protected readonly i18n: I18nService,
    private readonly noticeService: NoticeService,
    private readonly onlineStatusService: OnlineStatusService,
    private readonly paratextService: ParatextService,
    private readonly progressService: ProgressService,
    private readonly trainingFileService: TrainingDataService,
    private readonly userService: UserService,
    private readonly dialogService: DialogService
  ) {}

  async ngOnInit(): Promise<void> {
    combineLatest([this.draftSourcesService.getDraftProjectSources(), this.activatedProject.projectId$])
      .pipe(
        quietTakeUntilDestroyed(this.destroyRef),
        filter(
          ([{ trainingTargets, draftingSources }], projectId) =>
            trainingTargets[0] != null && draftingSources[0] != null && projectId != null
        ),
        distinctUntilChanged(isEqual)
      )
      .subscribe(
        // Build book lists
        async ([{ trainingTargets, trainingSources, draftingSources }, projectId]) => {
          // Force refresh on remote changes
          if (this.draftingSources.length > 0 || this.trainingSources.length > 0 || this.trainingTargets.length > 0) {
            if (this.dialogService.openDialogCount > 0 || this.isStepsCompleted) return;
            await this.dialogService.message(
              'draft_generation_steps.remote_changes',
              'draft_generation_steps.remote_changes_start_over',
              true
            );
            this.cancel.emit();
          }

          this.setProjectDisplayNames(trainingTargets[0], draftingSources[0]);

          // The null values will have been filtered above
          const target = trainingTargets[0]!;
          const draftingSource: DraftSource = draftingSources[0]!;
          // If both source and target project languages are in the NLLB,
          // training book selection is optional (and discouraged).
          this.isTrainingOptional =
            (await this.nllbLanguageService.isNllbLanguageAsync(target.writingSystem.tag)) &&
            (await this.nllbLanguageService.isNllbLanguageAsync(draftingSource.writingSystem.tag));

          this.draftingSources = draftingSources.filter(s => s !== undefined) ?? [];
          this.trainingSources = trainingSources.filter(s => s !== undefined) ?? [];
          this.trainingTargets = trainingTargets.filter(t => t !== undefined) ?? [];

          // TODO: When implementing multiple drafting sources, this will need to be updated to handle multiple sources
          const draftingSourceBooks = new Set<number>();
          for (const text of draftingSource.texts) {
            draftingSourceBooks.add(text.bookNum);
          }

          const trainingSourceBooks: Set<number> = new Set<number>(trainingSources[0]?.texts.map(t => t.bookNum));
          const secondTrainingSourceBooks: Set<number> = new Set<number>(trainingSources[1]?.texts.map(t => t.bookNum));
          this.projectProgress.clear();
          for (const target of this.trainingTargets) {
            const targetProgress: ProjectProgress = await this.progressService.getProgress(target.projectRef, {
              maxStalenessMs: 30000
            });
            this.projectProgress.set(target.projectRef, targetProgress);
          }

          for (const source of this.draftingSources) {
            this.availableTranslateBooks[source?.projectRef] = [];
            if (source.noAccess) continue;
            const draftSourceProgress: ProjectProgress = await this.progressService.getProgress(source.projectRef, {
              maxStalenessMs: 30000
            });
            this.projectProgress.set(source.projectRef, draftSourceProgress);
          }

          this.availableTrainingBooks[projectId!] = [];
          for (const source of this.trainingSources) {
            this.availableTrainingBooks[source?.projectRef] = [];
            if (source.noAccess || this.projectProgress.has(source.projectRef)) continue;
            const trainingSourceProgress: ProjectProgress = await this.progressService.getProgress(source.projectRef, {
              maxStalenessMs: 30000
            });
            this.projectProgress.set(source.projectRef, trainingSourceProgress);
          }

          this.trainingDataQuery?.dispose();
          this.trainingDataQuery = await this.trainingFileService.queryTrainingDataAsync(projectId!, this.destroyRef);
          this.trainingDataQuerySubscription?.unsubscribe();

          this.trainingDataQuerySubscription = merge(
            this.trainingDataQuery.localChanges$,
            this.trainingDataQuery.ready$,
            this.trainingDataQuery.remoteChanges$,
            this.trainingDataQuery.remoteDocChanges$
          )
            .pipe(quietTakeUntilDestroyed(this.destroyRef, { logWarnings: false }))
            .subscribe(() => {
              this.trainingDataFiles =
                (this.trainingDataQuery?.docs
                  .map(doc => doc.data)
                  .filter(d => d != null && !d.deleted) as Readonly<TrainingData>[]) ?? [];
            });

          // Reset the field that toggles a notice that books were automatically selected
          this.trainingBooksWereAutoSelected = false;

          // If book exists in both target and source, add to available books.
          // Otherwise, add to unusable books.
          // Ensure books are displayed in ascending canonical order.
          const targetBooks = new Set<number>();
          const projectProgress = await this.progressService.getProgress(projectId, {
            maxStalenessMs: 30_000
          });
          for (const text of target.texts.slice().sort((a, b) => a.bookNum - b.bookNum)) {
            const bookNum = text.bookNum;
            targetBooks.add(bookNum);

            // Exclude non-canonical books
            if (Canon.isExtraMaterial(bookNum)) {
              continue;
            }

            // Translate books
            // TODO: When implementing multiple drafting sources, this should be updated to handle multiple sources
            if (draftingSourceBooks.has(bookNum)) {
              const book: Book = { number: bookNum, selected: false };
              this.allAvailableTranslateBooks.push(book);
              if (this.bookHasVerseContent(draftingSource.projectRef, bookNum)) {
                this.availableTranslateBooks[draftingSource.projectRef].push(book);
              } else {
                this.emptyTranslateSourceBooks.push(bookNum);
              }
            } else {
              this.unusableTranslateSourceBooks.push(bookNum);
            }

            // See if there is an existing training scripture range
            const draftConfig: DraftConfig | undefined =
              this.activatedProject.projectDoc?.data?.translateConfig.draftConfig;
            this.isCustomConfigSet = draftConfig?.servalConfig != null;
            const hasPreviousTrainingRange: boolean =
              (draftConfig?.lastSelectedTrainingScriptureRanges ?? []).length > 0;

            // Determine if this book should be auto selected. The requirements are:
            // 1. The project does not have any previous training selections made.
            // 2. At least 10 non-blank segments in the book
            // 3. At least 99 percent of the book has been translated or 3 or fewer blank segments.
            const bookId = Canon.bookNumberToId(bookNum);
            const bookProgress: BookProgress | undefined = projectProgress.books.find(b => b.bookId === bookId);
            const selected: boolean =
              !hasPreviousTrainingRange &&
              bookProgress != null &&
              bookProgress.verseSegments - bookProgress.blankVerseSegments >
                MIN_TRANSLATED_SEGMENTS_TO_AUTO_SELECT_BOOK &&
              (bookProgress.blankVerseSegments / bookProgress.verseSegments <= 0.01 ||
                bookProgress.blankVerseSegments <= 3);

            // If books were automatically selected, reflect this in the UI via a notice
            this.trainingBooksWereAutoSelected ||= selected;

            // Training books
            let isPresentInASource = false;
            let isBookEmptyInAllSources = true;
            const firstTrainingSourceRef = trainingSources[0]?.projectRef;
            if (firstTrainingSourceRef != null && trainingSourceBooks.has(bookNum)) {
              isPresentInASource = true;
              if (this.bookHasVerseContent(firstTrainingSourceRef, bookNum)) {
                this.availableTrainingBooks[firstTrainingSourceRef].push({
                  number: bookNum,
                  selected: selected
                });
                isBookEmptyInAllSources = false;
              }
            } else {
              this.unusableTrainingSourceBooks.push(bookNum);
            }
            const secondTrainingSourceRef = trainingSources[1]?.projectRef;
            if (secondTrainingSourceRef != null && secondTrainingSourceBooks.has(bookNum)) {
              isPresentInASource = true;
              if (this.bookHasVerseContent(secondTrainingSourceRef, bookNum)) {
                this.availableTrainingBooks[secondTrainingSourceRef].push({
                  number: bookNum,
                  selected: selected
                });
                isBookEmptyInAllSources = false;
              }
            }
            if (isPresentInASource) {
              if (isBookEmptyInAllSources || !this.bookHasVerseContent(projectId!, bookNum)) {
                // the books is present but is empty
                this.trainingBooksWithoutEnoughData.push(bookNum);
              } else {
                this.availableTrainingBooks[projectId!].push({ number: bookNum, selected: selected });
              }
            }
          }

          this.setInitialTrainingBooks(projectId!);
          this.setInitialTranslateBooks();

          // Store the books that are not in the target
          this.unusableTrainingTargetBooks = [...trainingSourceBooks].filter(
            bookNum => !targetBooks.has(bookNum) && Canon.isCanonical(bookNum)
          );
          this.unusableTranslateTargetBooks = [...draftingSourceBooks].filter(
            bookNum => !targetBooks.has(bookNum) && Canon.isCanonical(bookNum)
          );

          // set developer settings
          if (this.featureFlags.showDeveloperTools.enabled) {
            this.fastTraining =
              this.activatedProject.projectDoc?.data?.translateConfig.draftConfig.fastTraining ?? false;
            this.useEcho = this.activatedProject.projectDoc?.data?.translateConfig.draftConfig.useEcho ?? false;
          }

          this.sendEmailOnBuildFinished =
            this.activatedProject.projectDoc?.data?.translateConfig.draftConfig.sendEmailOnBuildFinished ?? false;

          // See if the target and any of the sources need updating
          const projectIds: string[] = [
            ...trainingTargets.map(s => s.projectRef),
            ...trainingSources.map(s => s.projectRef),
            ...draftingSources.map(s => s.projectRef)
          ];
          const projects: ParatextProject[] | undefined = await this.paratextService.getProjects();

          // NOTE: Non-connected projects will show a warning on the primary generate draft page
          this.projectsPendingUpdate = (projects ?? [])
            .filter(p => p.projectId != null && projectIds.includes(p.projectId) && p.isConnected && p.hasUpdate)
            .map(p => ({
              projectId: p.projectId!,
              name: p.name == null || p.name.length === 0 ? p.shortName : p.name,
              syncUrl: `/projects/${p.projectId}/sync`
            }));

          this.hasLoaded = true;
        }
      );
    this.currentUserDoc = await this.userService.getCurrentUser();
  }

  get currentUserEmail(): string | undefined {
    return this.currentUserDoc?.data?.email;
  }

  get firstTrainingSource(): string {
    return projectLabel(this.trainingSources[0]);
  }

  get trainingSourceBooksSelected(): boolean {
    for (const source of this.trainingSources) {
      if (this.availableTrainingBooks[source.projectRef]?.filter(b => b.selected)?.length > 0) {
        return true;
      }
    }
    return false;
  }

  get translatedBooksSelectedInTrainingSources(): boolean {
    const translatedBooksSelected: Book[] = this.selectedTrainingBooksByProj(this.activatedProject.projectId);
    const selectedInSource1: Book[] =
      this.trainingSources[0] != null ? this.selectedTrainingBooksByProj(this.trainingSources[0].projectRef) : [];
    const selectedInSource2: Book[] =
      this.trainingSources[1] != null ? this.selectedTrainingBooksByProj(this.trainingSources[1].projectRef) : [];
    const selectedInSources: number[] = Array.from(
      new Set<number>([...selectedInSource1, ...selectedInSource2].map(b => b.number))
    );
    return translatedBooksSelected.every(b => selectedInSources.includes(b.number));
  }

  private _booksToTranslate?: Book[];
  booksToTranslate(): Book[] {
    const value =
      Object.values(this.availableTranslateBooks)
        .flat()
        .filter(b => b.selected) ?? [];
    if (this._booksToTranslate?.toString() !== value?.toString()) {
      this._booksToTranslate = value;
    }
    return this._booksToTranslate;
  }

  private _selectedTranslateBooks: { [projectRef: string]: Book[] } = {};
  selectedTranslateBooksByProj(projectRef?: string): Book[] {
    if (projectRef == null) return [];
    const value = this.availableTranslateBooks[projectRef]?.filter(b => b.selected) ?? [];
    if (this._selectedTranslateBooks[projectRef]?.toString() !== value?.toString()) {
      this._selectedTranslateBooks[projectRef] = value;
    }

    return this._selectedTranslateBooks[projectRef];
  }

  selectableTranslateBooksByProj(projectRef?: string): Book[] {
    if (this.activatedProject.projectId == null || projectRef == null) return [];
    return this.availableTranslateBooks[projectRef] ?? [];
  }

  selectedTranslateBooksAsString(): string {
    return this.i18n.enumerateList(this.booksToTranslate().map(b => this.i18n.localizeBook(b.number)));
  }

  selectedTrainingBooksCollapsed(): TrainingGroup[] {
    const trainingRanges: TrainingGroup[] = [];
    for (const projectRef in this.availableTrainingBooks) {
      if (projectRef === this.activatedProject.projectId) continue; //target would be a duplicate here
      const source = this.trainingSources.find(s => s.projectRef === projectRef);
      if (source == null) return []; // during updates, trainingSources can briefly differ from availableTrainingBooks

      const trainingBooksBySource: number[] = this.availableTrainingBooks[projectRef]
        .filter(b => b.selected)
        .map(b => b.number);
      trainingRanges.push({
        ranges: this.i18n.formatAndLocalizeBookRange(trainingBooksBySource),
        sourceName: source.shortName
      });
    }
    return trainingRanges;
  }

  private _selectableTrainingBooks: { [projectRef: string]: Book[] } = {};
  selectableTrainingBooksByProj(projectRef?: string): Book[] {
    if (this.activatedProject.projectId == null || projectRef == null) return [];
    //start with the books in source and target
    const booksInTargetAndSource = this.availableTrainingBooks[projectRef] ?? [];
    //filter out selected books to draft
    const booksNotBeingTranslated = booksInTargetAndSource.filter(
      b => this.allAvailableTranslateBooks.find(x => x.number === b.number)?.selected === false
    );

    let value: Book[];
    if (projectRef === this.activatedProject.projectId) {
      value = booksNotBeingTranslated;
    } else {
      //filter out any book not translated
      const translatedBooks = this.selectedTrainingBooksByProj(this.activatedProject.projectId);
      value = booksNotBeingTranslated.filter(b => translatedBooks.find(x => x.number === b.number));
    }

    if (this._selectableTrainingBooks[projectRef]?.toString() !== value.toString()) {
      this._selectableTrainingBooks[projectRef] = value;
    }

    return this._selectableTrainingBooks[projectRef];
  }

  private _selectedTrainingBooks: { [projectRef: string]: Book[] } = {};
  selectedTrainingBooksByProj(projectRef?: string): Book[] {
    if (projectRef == null) return [];
    const value = this.availableTrainingBooks[projectRef]?.filter(b => b.selected) ?? [];
    if (this._selectedTrainingBooks[projectRef]?.toString() !== value?.toString()) {
      this._selectedTrainingBooks[projectRef] = value;
    }

    return this._selectedTrainingBooks[projectRef];
  }

  onTranslatedBookSelect(selectedBooks: number[]): void {
    if (this.activatedProject.projectId == null) return;
    const newlySelectedBooks: number[] = this.availableTrainingBooks[this.activatedProject.projectId]
      .filter(b => !b.selected && selectedBooks.includes(b.number))
      .map(b => b.number);
    //update selections in translated books
    for (const book of this.availableTrainingBooks[this.activatedProject.projectId]) {
      book.selected = selectedBooks.includes(book.number);
    }

    //for each selected book, select the matching book in the sources
    for (const [projectRef, trainingBooks] of Object.entries(this.availableTrainingBooks)) {
      if (projectRef === this.activatedProject.projectId) continue;

      trainingBooks.forEach(b => {
        if (newlySelectedBooks.includes(b.number)) {
          b.selected = true;
        }
        // ensure any books source training books not selected in translated books is unselected
        if (!selectedBooks.includes(b.number)) {
          b.selected = false;
        }
      });
    }

    this.clearErrorMessage();
  }

  onSourceTrainingBookSelect(selectedBooks: number[], source: TranslateSource): void {
    for (const book of this.availableTrainingBooks[source.projectRef]) {
      book.selected = selectedBooks.includes(book.number);
    }
    this.clearErrorMessage();
  }

  onTranslateBookSelect(selectedBooks: number[], source: TranslateSource): void {
    for (const book of this.availableTranslateBooks[source.projectRef]) {
      book.selected = selectedBooks.includes(book.number);
    }
    this.clearErrorMessage();
  }

  onStepChange(): void {
    this.updateSelectedTrainingBooks();
    this.clearErrorMessage();
  }

  tryAdvanceStep(): void {
    if (!this.validateCurrentStep()) {
      return;
    }

    if (this.stepper.selected !== this.stepper.steps.last) {
      this.stepper.next();
    } else {
      if (!this.onlineStatusService.isOnline) {
        this.noticeService.show(this.i18n.translateStatic('draft_generation.offline_message'));
        return;
      }

      this.isStepsCompleted = true;

      const trainingData: ProjectScriptureRange[] = [];
      for (const source of this.trainingSources) {
        const booksForThisSource: Book[] = this.selectedTrainingBooksByProj(source.projectRef);
        if (booksForThisSource.length > 0) {
          trainingData.push({
            projectId: source.projectRef,
            scriptureRange: booksForThisSource.map(b => Canon.bookNumberToId(b.number)).join(';')
          });
        }
      }

      const translationData: ProjectScriptureRange[] = [];
      for (const source of this.draftingSources) {
        const booksForThisSource: Book[] = this.selectedTranslateBooksByProj(source.projectRef);
        if (booksForThisSource.length > 0) {
          translationData.push({
            projectId: source.projectRef,
            scriptureRange: booksForThisSource.map(b => Canon.bookNumberToId(b.number)).join(';')
          });
        }
      }

      const trainingFiles =
        this.activatedProject.projectDoc?.data?.translateConfig.draftConfig.lastSelectedTrainingDataFiles ?? [];

      this.done.emit({
        trainingScriptureRanges: trainingData,
        trainingDataFiles: trainingFiles,
        translationScriptureRanges: translationData,
        fastTraining: this.fastTraining,
        useEcho: this.useEcho,
        sendEmailOnBuildFinished: this.sendEmailOnBuildFinished
      });
    }
  }

  bookNames(books: number[]): string {
    return this.i18n.enumerateList(books.map(bookNum => this.i18n.localizeBook(bookNum)));
  }

  protected projectLabel(source: TranslateSource): string {
    return projectLabel(source);
  }

  private updateSelectedTrainingBooks(): void {
    const booksForTranslation: number[] = this.allAvailableTranslateBooks.filter(b => b.selected).map(b => b.number);
    for (const [, trainingBooks] of Object.entries(this.availableTrainingBooks)) {
      // set the selected state of any training book to false if it is selected for translation
      trainingBooks.forEach(b => (b.selected = booksForTranslation.includes(b.number) ? false : b.selected));
    }

    // If books were auto-selected for training, but none are selected now, clear the notice
    if (
      this.trainingBooksWereAutoSelected &&
      !Object.values(this.availableTrainingBooks).some(books => books.some(book => book.selected))
    ) {
      this.trainingBooksWereAutoSelected = false;
    }
  }

  private validateCurrentStep(): boolean {
    const isValid = this.stepper.selected?.completed!;
    this.showBookSelectionError = !isValid;
    return isValid;
  }

  private clearErrorMessage(): void {
    this.showBookSelectionError = false;
  }

  private setInitialTranslateBooks(): void {
    // Get the previously selected translation books from the target project
    const previousTranslation =
      this.activatedProject.projectDoc?.data?.translateConfig.draftConfig.lastSelectedTranslationScriptureRanges ?? [];
    for (const range of previousTranslation) {
      const source = this.draftingSources.find(s => s.projectRef === range.projectId);
      if (source !== undefined) {
        for (const bookNum of booksFromScriptureRange(range.scriptureRange)) {
          const sourceBook = this.availableTranslateBooks[source.projectRef].find(b => b.number === bookNum);
          if (sourceBook !== undefined) {
            sourceBook.selected = true;
          }
        }
      }
    }
  }

  private setInitialTrainingBooks(targetProjectId: string): void {
    // Get the previously selected training books from the target project
    const previousTraining =
      this.activatedProject.projectDoc?.data?.translateConfig.draftConfig.lastSelectedTrainingScriptureRanges ?? [];
    for (const range of previousTraining) {
      const source = this.trainingSources.find(s => s.projectRef === range.projectId);
      if (source !== undefined) {
        for (const bookNum of booksFromScriptureRange(range.scriptureRange)) {
          //select in the source
          const sourceBook = this.availableTrainingBooks[source.projectRef].find(b => b.number === bookNum);
          if (sourceBook !== undefined) {
            sourceBook.selected = true;
          }
          //select in the target
          const targetBook = this.availableTrainingBooks[targetProjectId].find(b => b.number === bookNum);
          if (targetBook !== undefined) {
            targetBook.selected = true;
          }
        }
      }
    }
  }

  /** Check whether a project book has any translated verses. */
  private bookHasVerseContent(projectId: string, bookNum: number): boolean {
    const textProgress: ProjectProgress | undefined = this.projectProgress.get(projectId);
    if (textProgress == null) return false;
    const bookId: string = Canon.bookNumberToId(bookNum);
    const bookProgress: BookProgress | undefined = textProgress.books.find(p => p.bookId === bookId);
    if (bookProgress == null) return false;
    return bookProgress.verseSegments - bookProgress.blankVerseSegments >= MIN_TRANSLATED_SEGMENTS_FOR_NON_EMPTY_BOOK;
  }

  private setProjectDisplayNames(target: DraftSource | undefined, draftingSource: DraftSource | undefined): void {
    this.targetProjectName = target != null ? projectLabel(target) : '';
    this.draftingSourceProjectName = draftingSource != null ? projectLabel(draftingSource) : '';
  }
}
