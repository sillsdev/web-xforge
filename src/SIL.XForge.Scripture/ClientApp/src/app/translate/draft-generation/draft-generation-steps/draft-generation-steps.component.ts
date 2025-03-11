import { Component, DestroyRef, EventEmitter, OnInit, Output, ViewChild } from '@angular/core';
import { MatStepper } from '@angular/material/stepper';
import { translate, TranslocoModule } from '@ngneat/transloco';
import { Canon } from '@sillsdev/scripture';
import { TranslocoMarkupModule } from 'ngx-transloco-markup';
import { TrainingData } from 'realtime-server/lib/esm/scriptureforge/models/training-data';
import { ProjectScriptureRange, TranslateSource } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { combineLatest, merge, Subject, Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { I18nService } from 'xforge-common/i18n.service';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { filterNullish } from 'xforge-common/util/rxjs-util';
import { quietTakeUntilDestroyed } from 'xforge-common/utils';
import { TrainingDataDoc } from '../../../core/models/training-data-doc';
import { BookMultiSelectComponent } from '../../../shared/book-multi-select/book-multi-select.component';
import { ProgressService, TextProgress } from '../../../shared/progress-service/progress.service';
import { SharedModule } from '../../../shared/shared.module';
import { booksFromScriptureRange, projectLabel } from '../../../shared/utils';
import { NllbLanguageService } from '../../nllb-language.service';
import { ConfirmSourcesComponent } from '../confirm-sources/confirm-sources.component';
import { DraftSource, DraftSourcesService } from '../draft-sources.service';
import { TrainingDataMultiSelectComponent } from '../training-data/training-data-multi-select.component';
import { TrainingDataService } from '../training-data/training-data.service';

export interface DraftGenerationStepsResult {
  trainingDataFiles: string[];
  trainingScriptureRange?: string;
  trainingScriptureRanges: ProjectScriptureRange[];
  translationScriptureRange?: string;
  translationScriptureRanges?: ProjectScriptureRange[];
  fastTraining: boolean;
}

export interface Book {
  number: number;
  selected: boolean;
}

export interface TrainingBook extends Book, TrainingPair {}

export interface TrainingGroup extends TrainingPair {
  ranges: string[];
}

interface TrainingPair {
  sourceName: string;
}

@Component({
  selector: 'app-draft-generation-steps',
  templateUrl: './draft-generation-steps.component.html',
  styleUrls: ['./draft-generation-steps.component.scss'],
  standalone: true,
  imports: [
    SharedModule,
    UICommonModule,
    TranslocoModule,
    TranslocoMarkupModule,
    BookMultiSelectComponent,
    TrainingDataMultiSelectComponent,
    ConfirmSourcesComponent
  ]
})
export class DraftGenerationStepsComponent implements OnInit {
  @Output() readonly done = new EventEmitter<DraftGenerationStepsResult>();
  @Output() readonly cancel = new EventEmitter();
  @ViewChild(MatStepper) stepper!: MatStepper;

  availableTranslateBooks: Book[] = [];
  availableTrainingBooks: { [projectRef: string]: Book[] } = {}; //books in both source and target
  availableTrainingFiles: Readonly<TrainingData>[] = [];

  // Unusable books do not exist in the target or corresponding drafting/training source project
  unusableTranslateSourceBooks: number[] = [];
  unusableTranslateTargetBooks: number[] = [];
  unusableTrainingSourceBooks: number[] = [];
  unusableTrainingTargetBooks: number[] = [];

  selectedTrainingFileIds: string[] = [];

  draftingSourceProjectName?: string;
  targetProjectName?: string;

  showBookSelectionError = false;
  isTrainingOptional = false;

  trainingDataFilesAvailable = false;
  fastTraining: boolean = false;

  expandUnusableTranslateBooks = false;
  expandUnusableTrainingBooks = false;
  isStepsCompleted = false;

  protected languagesVerified = false;
  protected nextClickedOnLanguageVerification = false;
  protected hasLoaded = false;

  protected trainingSources: DraftSource[] = [];
  protected trainingTargets: DraftSource[] = [];
  protected translatedBooksWithNoSource: number[] = [];

  private trainingDataQuery?: RealtimeQuery<TrainingDataDoc>;
  /** Emits when the training data query results change */
  private trainingDataQueryUpdate$: Subject<void> = new Subject<void>();
  private trainingDataQuerySubscription?: Subscription;
  private isTrainingDataInitialized: boolean = false;

  constructor(
    private readonly destroyRef: DestroyRef,
    protected readonly activatedProject: ActivatedProjectService,
    private readonly draftSourcesService: DraftSourcesService,
    protected readonly featureFlags: FeatureFlagService,
    private readonly nllbLanguageService: NllbLanguageService,
    private readonly trainingDataService: TrainingDataService,
    protected readonly i18n: I18nService,
    private readonly onlineStatusService: OnlineStatusService,
    private readonly noticeService: NoticeService,
    private readonly progressService: ProgressService
  ) {}

  ngOnInit(): void {
    combineLatest([this.draftSourcesService.getDraftProjectSources(), this.activatedProject.projectId$])
      .pipe(
        quietTakeUntilDestroyed(this.destroyRef),
        filter(([{ trainingTargets, draftingSources }], projectId) => {
          this.setProjectDisplayNames(trainingTargets[0], draftingSources[0]);
          return trainingTargets[0] != null && draftingSources[0] != null && projectId != null;
        })
      )
      .subscribe(
        // Build book lists
        async ([{ trainingTargets, trainingSources, draftingSources }, projectId]) => {
          // The null values will have been filtered above
          const target = trainingTargets[0]!;
          const draftingSource = draftingSources[0]!;
          // If both source and target project languages are in the NLLB,
          // training book selection is optional (and discouraged).
          this.isTrainingOptional =
            (await this.nllbLanguageService.isNllbLanguageAsync(target.writingSystem.tag)) &&
            (await this.nllbLanguageService.isNllbLanguageAsync(draftingSource.writingSystem.tag));

          this.trainingSources = trainingSources.filter(s => s !== undefined) ?? [];
          this.trainingTargets = trainingTargets.filter(t => t !== undefined) ?? [];

          const draftingSourceBooks = new Set<number>();
          for (const text of draftingSource.texts) {
            draftingSourceBooks.add(text.bookNum);
          }

          const trainingSourceBooks: Set<number> = new Set<number>(trainingSources[0]?.texts.map(t => t.bookNum));
          const additionalTrainingSourceBooks: Set<number> = new Set<number>(
            trainingSources[1]?.texts.map(t => t.bookNum)
          );

          this.availableTranslateBooks = [];
          this.availableTrainingBooks[projectId!] = [];
          for (const source of this.trainingSources) {
            this.availableTrainingBooks[source?.projectRef] = [];
          }

          // If book exists in both target and source, add to available books.
          // Otherwise, add to unusable books.
          // Ensure books are displayed in ascending canonical order.
          const targetBooks = new Set<number>();
          for (const text of target.texts.slice().sort((a, b) => a.bookNum - b.bookNum)) {
            const bookNum = text.bookNum;
            targetBooks.add(bookNum);

            // Exclude non-canonical books
            if (Canon.isExtraMaterial(bookNum)) {
              continue;
            }

            // Translate books
            if (draftingSourceBooks.has(bookNum)) {
              this.availableTranslateBooks.push({ number: bookNum, selected: false });
            } else {
              this.unusableTranslateSourceBooks.push(bookNum);
            }

            // Training books
            let isPresentInASource = false;
            if (trainingSourceBooks.has(bookNum)) {
              this.availableTrainingBooks[trainingSources[0]!.projectRef].push({ number: bookNum, selected: false });
              isPresentInASource = true;
            } else {
              this.unusableTrainingSourceBooks.push(bookNum);
              const textProgress: TextProgress | undefined = this.progressService.texts.find(
                t => t.text.bookNum === bookNum
              );
              if (textProgress != null && textProgress.translated > 10) {
                // we consider books with more than 10 translated segments as translated
                this.translatedBooksWithNoSource.push(bookNum);
              }
            }
            if (trainingSources[1] != null && additionalTrainingSourceBooks.has(bookNum)) {
              this.availableTrainingBooks[trainingSources[1].projectRef].push({ number: bookNum, selected: false });
              isPresentInASource = true;
            }
            if (isPresentInASource) {
              this.availableTrainingBooks[projectId!].push({ number: bookNum, selected: false });
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

          this.hasLoaded = true;
        }
      );

    // Get the training data files for the project
    this.activatedProject.projectDoc$
      .pipe(quietTakeUntilDestroyed(this.destroyRef), filterNullish())
      .subscribe(async projectDoc => {
        this.isTrainingDataInitialized = false;
        // Query for all training data files in the project
        this.trainingDataQuery?.dispose();
        this.trainingDataQuery = await this.trainingDataService.queryTrainingDataAsync(projectDoc.id, this.destroyRef);
        this.trainingDataQuerySubscription?.unsubscribe();

        // Subscribe to the training data query results changes
        this.trainingDataQuerySubscription = merge(
          this.trainingDataQuery.localChanges$,
          this.trainingDataQuery.ready$,
          this.trainingDataQuery.remoteChanges$,
          this.trainingDataQuery.remoteDocChanges$
        )
          .pipe(quietTakeUntilDestroyed(this.destroyRef, { logWarnings: false }))
          .subscribe(() => this.trainingDataQueryUpdate$.next());
      });

    this.trainingDataQueryUpdate$.pipe(quietTakeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.availableTrainingFiles = [];
      if (this.activatedProject.projectDoc?.data?.translateConfig.draftConfig.additionalTrainingData) {
        this.availableTrainingFiles = this.trainingDataQuery?.docs.filter(d => d.data != null).map(d => d.data!) ?? [];
      }
      if (!this.isTrainingDataInitialized) {
        // Set the selection based on previous builds
        this.isTrainingDataInitialized = true;
        this.setInitialTrainingDataFiles(this.availableTrainingFiles.map(d => d.dataId));
      }
    });
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

  get firstTrainingSource(): string {
    return this.trainingSources[0]?.shortName ?? '';
  }

  private _booksToTranslate?: Book[];
  booksToTranslate(): Book[] {
    const value = this.availableTranslateBooks?.filter(b => b.selected) ?? [];
    if (this._booksToTranslate?.toString() !== value?.toString()) {
      this._booksToTranslate = value;
    }
    return this._booksToTranslate;
  }

  selectedTranslateBooksAsString(): string {
    return this.i18n.enumerateList(this.booksToTranslate().map(b => this.i18n.localizeBook(b.number)));
  }

  selectedTrainingBooksCollapsed(): TrainingGroup[] {
    const contiguousGroups: TrainingGroup[] = [];
    for (const projectRef in this.availableTrainingBooks) {
      if (projectRef === this.activatedProject.projectId) continue; //target would be a duplicate here
      const sourceShortName = this.trainingSources.find(s => s.projectRef === projectRef)!.shortName;

      const currentGroup: Book[] = [];
      for (const book of this.availableTrainingBooks[projectRef].filter(b => b.selected)) {
        const isBookConsecutive = book.number === currentGroup[currentGroup.length - 1]?.number + 1;
        if (currentGroup.length > 0 && !isBookConsecutive) {
          //process and reset current group
          addGroup(currentGroup, sourceShortName, this.i18n);
          currentGroup.length = 0;
        }
        //add book to current group
        currentGroup.push(book);
      }

      //add last group
      if (currentGroup.length > 0) {
        addGroup(currentGroup, sourceShortName, this.i18n);
      }
    }

    const groupsCollapsed: TrainingGroup[] = [];
    for (const group of contiguousGroups) {
      const matchIndex = groupsCollapsed.findIndex(g => g.sourceName === group.sourceName);
      if (matchIndex === -1) {
        //make a new group for this source/target
        groupsCollapsed.push(group);
      } else {
        //append the current group onto the matching group
        groupsCollapsed[matchIndex].ranges.push(group.ranges[0]);
      }
    }

    return groupsCollapsed;

    function addGroup(group: Book[], sourceShortName: string, i18n: I18nService): void {
      let range: string;
      if (group.length === 1) {
        range = i18n.localizeBook(group[0].number);
      } else {
        range = i18n.localizeBook(group[0].number) + ' - ' + i18n.localizeBook(group[group.length - 1].number);
      }
      contiguousGroups.push({
        ranges: [range],
        sourceName: sourceShortName
      });
    }
  }

  private _selectableTrainingBooks: { [projectRef: string]: Book[] } = {};
  selectableTrainingBooksByProj(projectRef?: string): Book[] {
    if (this.activatedProject.projectId == null || projectRef == null) return [];
    //start with the books in source and target
    const booksInTargetAndSource = this.availableTrainingBooks[projectRef] ?? [];
    //filter out selected books to draft
    const booksNotBeingTranslated = booksInTargetAndSource.filter(
      b => this.availableTranslateBooks.find(x => x.number === b.number)?.selected === false
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

  onTrainingDataSelect(selectedTrainingDataIds: string[]): void {
    this.selectedTrainingFileIds = selectedTrainingDataIds;
    this.clearErrorMessage();
  }

  onSourceTrainingBookSelect(selectedBooks: number[], source: TranslateSource): void {
    for (const book of this.availableTrainingBooks[source.projectRef]) {
      book.selected = selectedBooks.includes(book.number);
    }
    this.clearErrorMessage();
  }

  onTranslateBookSelect(selectedBooks: number[]): void {
    for (const book of this.availableTranslateBooks) {
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
        this.noticeService.show(translate('draft_generation.offline_message'));
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

      this.done.emit({
        trainingScriptureRanges: trainingData,
        trainingDataFiles: this.selectedTrainingFileIds,
        translationScriptureRange: this.booksToTranslate()
          .map(b => Canon.bookNumberToId(b.number))
          .join(';'),
        fastTraining: this.fastTraining
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
    const booksForTranslation: number[] = this.availableTranslateBooks.filter(b => b.selected).map(b => b.number);
    for (const [, trainingBooks] of Object.entries(this.availableTrainingBooks)) {
      // set the selected state of any training book to false if it is selected for translation
      trainingBooks.forEach(b => (b.selected = booksForTranslation.includes(b.number) ? false : b.selected));
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
    const previousTranslationRange: string =
      this.activatedProject.projectDoc?.data?.translateConfig.draftConfig.lastSelectedTranslationScriptureRange ?? '';
    const previousBooks: Set<number> = new Set<number>(booksFromScriptureRange(previousTranslationRange));

    for (const bookNum of previousBooks) {
      const book = this.availableTranslateBooks?.find(b => b.number === bookNum);
      if (book !== undefined) {
        book.selected = true;
      }
    }
  }

  private setInitialTrainingBooks(targetProjectId: string): void {
    // Get the previously selected training books from the target project
    const previousTraining =
      this.activatedProject.projectDoc?.data?.translateConfig.draftConfig.lastSelectedTrainingScriptureRanges ?? [];

    // Support old format
    const oldStyleRange: string | undefined =
      this.activatedProject.projectDoc?.data?.translateConfig.draftConfig.lastSelectedTrainingScriptureRange;
    if (previousTraining.length === 0 && oldStyleRange !== undefined) {
      previousTraining.push({ projectId: this.trainingSources[0].projectRef, scriptureRange: oldStyleRange });
    }

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

  private setInitialTrainingDataFiles(availableDataFiles: string[]): void {
    // Get the previously selected training data files from the target project
    const previousTrainingDataFiles: string[] =
      this.activatedProject.projectDoc?.data?.translateConfig.draftConfig.lastSelectedTrainingDataFiles ?? [];

    // The intersection is all of the available training data files in the target project that match the target's
    // previous training data files
    const intersection: string[] = availableDataFiles.filter(dataId => previousTrainingDataFiles.includes(dataId));

    // Set the selected data files to the intersection, or if the intersection is empty, do not select any
    this.selectedTrainingFileIds = intersection.length > 0 ? intersection : [];
    this.trainingDataFilesAvailable =
      this.activatedProject.projectDoc?.data?.translateConfig.draftConfig.additionalTrainingData ?? false;
  }

  private setProjectDisplayNames(target: DraftSource | undefined, draftingSource: DraftSource | undefined): void {
    this.targetProjectName = target != null ? projectLabel(target) : '';
    this.draftingSourceProjectName = draftingSource != null ? projectLabel(draftingSource) : '';
  }
}
