import { Component, EventEmitter, OnInit, Output, ViewChild } from '@angular/core';
import { MatStepper } from '@angular/material/stepper';
import { translate, TranslocoModule } from '@ngneat/transloco';
import { Canon } from '@sillsdev/scripture';
import { TranslocoMarkupModule } from 'ngx-transloco-markup';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { TrainingData } from 'realtime-server/lib/esm/scriptureforge/models/training-data';
import { ProjectScriptureRange, TranslateSource } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { merge, Subscription } from 'rxjs';
import { filter, tap } from 'rxjs/operators';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { I18nService } from 'xforge-common/i18n.service';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { filterNullish } from 'xforge-common/util/rxjs-util';
import { TrainingDataDoc } from '../../../core/models/training-data-doc';
import { BookMultiSelectComponent } from '../../../shared/book-multi-select/book-multi-select.component';
import { SharedModule } from '../../../shared/shared.module';
import { booksFromScriptureRange, projectLabel } from '../../../shared/utils';
import { NllbLanguageService } from '../../nllb-language.service';
import { ConfirmSourcesComponent } from '../confirm-sources/confirm-sources.component';
import { DraftSource, DraftSourceIds, DraftSourcesService } from '../draft-sources.service';
import { TrainingDataMultiSelectComponent } from '../training-data/training-data-multi-select.component';
import { TrainingDataUploadDialogComponent } from '../training-data/training-data-upload-dialog.component';
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
  name: string;
  number: number;
}

export interface TrainingBook extends Book, TrainingPair {}

export interface TrainingGroup extends TrainingPair {
  ranges: string[];
}

interface TrainingPair {
  source: string;
  target: string;
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
    TrainingDataUploadDialogComponent,
    ConfirmSourcesComponent
  ]
})
export class DraftGenerationStepsComponent extends SubscriptionDisposable implements OnInit {
  @Output() readonly done = new EventEmitter<DraftGenerationStepsResult>();
  @Output() readonly cancel = new EventEmitter();
  @ViewChild(MatStepper) stepper!: MatStepper;

  availableTranslateBooks?: number[] = undefined;
  availableTrainingBooks: number[] = [];
  selectableSourceTrainingBooks: number[] = [];
  selectableAdditionalSourceTrainingBooks: number[] = [];
  availableTrainingData: Readonly<TrainingData>[] = [];

  // Unusable books do not exist in the target or corresponding drafting/training source project
  unusableTranslateSourceBooks: number[] = [];
  unusableTranslateTargetBooks: number[] = [];
  unusableTrainingSourceBooks: number[] = [];
  unusableTrainingTargetBooks: number[] = [];

  initialSelectedTrainingBooks: number[] = [];
  initialSelectedTranslateBooks: number[] = [];
  userSelectedTrainingBooks: TrainingBook[] = [];
  userSelectedTranslateBooks: Book[] = [];
  userSelectedSourceTrainingBooks: number[] = [];
  userSelectedAdditionalSourceTrainingBooks: number[] = [];

  selectedTrainingDataIds: string[] = [];

  draftingSourceProjectName?: string;
  trainingSourceProjectName?: string;
  trainingAdditionalSourceProjectName?: string;
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

  // When translate books are selected, they will be filtered out from this list
  private initialAvailableTrainingBooks: number[] = [];
  private availableAdditionalTrainingBooks: number[] = [];
  private draftSourceProjectIds?: DraftSourceIds;
  private trainingDataQuery?: RealtimeQuery<TrainingDataDoc>;
  private trainingDataSub?: Subscription;

  readonly trainingSources: TranslateSource[] = [];
  readonly trainingTargets: SFProjectProfile[] = [];

  constructor(
    private readonly activatedProject: ActivatedProjectService,
    private readonly draftSourcesService: DraftSourcesService,
    protected readonly featureFlags: FeatureFlagService,
    private readonly nllbLanguageService: NllbLanguageService,
    private readonly trainingDataService: TrainingDataService,
    protected readonly i18n: I18nService,
    private readonly onlineStatusService: OnlineStatusService,
    private readonly noticeService: NoticeService
  ) {
    super();
    const project = activatedProject.projectDoc!.data!;
    this.trainingTargets.push(project);

    let trainingSource: TranslateSource | undefined;
    if (project.translateConfig.draftConfig.alternateTrainingSourceEnabled) {
      trainingSource = project.translateConfig.draftConfig.alternateTrainingSource;
    } else {
      trainingSource = project.translateConfig.source;
    }

    if (trainingSource != null) {
      this.trainingSources.push(trainingSource);
    }

    if (project.translateConfig.draftConfig.additionalTrainingSourceEnabled) {
      this.trainingSources.push(project.translateConfig.draftConfig.additionalTrainingSource!);
    }
  }

  get trainingSourceBooksSelected(): boolean {
    return this.userSelectedSourceTrainingBooks.length > 0 || this.userSelectedAdditionalSourceTrainingBooks.length > 0;
  }

  ngOnInit(): void {
    this.subscribe(
      this.draftSourcesService.getDraftProjectSources().pipe(
        filter(({ target, source, alternateSource, alternateTrainingSource, additionalTrainingSource }) => {
          this.setProjectDisplayNames(
            target,
            alternateSource ?? source,
            alternateTrainingSource,
            additionalTrainingSource
          );
          return target != null && source != null;
        })
      ),
      // Build book lists
      async ({
        target,
        source,
        alternateSource,
        alternateTrainingSource,
        additionalTrainingSource,
        draftSourceIds
      }) => {
        // The null values will have been filtered above
        target = target!;
        // Use the alternate source if specified, otherwise use the source
        const draftingSource = alternateSource ?? source!;
        // If both source and target project languages are in the NLLB,
        // training book selection is optional (and discouraged).
        this.isTrainingOptional =
          (await this.nllbLanguageService.isNllbLanguageAsync(target.writingSystem.tag)) &&
          (await this.nllbLanguageService.isNllbLanguageAsync(draftingSource.writingSystem.tag));

        const draftingSourceBooks = new Set<number>();
        for (const text of draftingSource.texts) {
          draftingSourceBooks.add(text.bookNum);
        }

        let trainingSourceBooks: Set<number> =
          alternateTrainingSource != null
            ? new Set<number>(alternateTrainingSource.texts.map(t => t.bookNum))
            : draftingSourceBooks;
        let additionalTrainingSourceBooks: Set<number> | undefined =
          additionalTrainingSource != null
            ? new Set<number>(additionalTrainingSource?.texts.map(t => t.bookNum))
            : undefined;

        this.draftSourceProjectIds = draftSourceIds;
        this.availableTranslateBooks = [];

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
            this.availableTranslateBooks.push(bookNum);
          } else {
            this.unusableTranslateSourceBooks.push(bookNum);
          }

          // Training books
          if (trainingSourceBooks.has(bookNum)) {
            this.availableTrainingBooks.push(bookNum);
          } else {
            this.unusableTrainingSourceBooks.push(bookNum);
          }
          if (additionalTrainingSourceBooks != null && additionalTrainingSourceBooks.has(bookNum)) {
            this.availableAdditionalTrainingBooks.push(bookNum);
          }
        }

        // Store initially available training books that will be filtered to remove user selected translate books
        this.initialAvailableTrainingBooks = this.availableTrainingBooks;

        this.setInitialTrainingBooks(this.availableTrainingBooks);
        this.setInitialTranslateBooks(this.availableTranslateBooks);

        // Store the books that are not in the target
        this.unusableTrainingTargetBooks = [...trainingSourceBooks].filter(
          bookNum => !targetBooks.has(bookNum) && Canon.isCanonical(bookNum)
        );
        this.unusableTranslateTargetBooks = [...draftingSourceBooks].filter(
          bookNum => !targetBooks.has(bookNum) && Canon.isCanonical(bookNum)
        );
      }
    );

    // Get the training data files for the project
    this.subscribe(
      this.activatedProject.projectDoc$.pipe(
        filterNullish(),
        tap(async projectDoc => {
          // Query for all training data files in the project
          this.trainingDataQuery?.dispose();
          this.trainingDataQuery = await this.trainingDataService.queryTrainingDataAsync(projectDoc.id);
          let projectChanged: boolean = true;

          // Subscribe to this query, and show these
          this.trainingDataSub?.unsubscribe();
          this.trainingDataSub = this.subscribe(
            merge(
              this.trainingDataQuery.localChanges$,
              this.trainingDataQuery.ready$,
              this.trainingDataQuery.remoteChanges$,
              this.trainingDataQuery.remoteDocChanges$
            ),
            () => {
              this.availableTrainingData = [];
              if (projectDoc.data?.translateConfig.draftConfig.additionalTrainingData) {
                this.availableTrainingData =
                  this.trainingDataQuery?.docs.filter(d => d.data != null).map(d => d.data!) ?? [];
              }
              if (projectChanged) {
                // Set the selection based on previous builds
                projectChanged = false;
                this.setInitialTrainingDataFiles(this.availableTrainingData.map(d => d.dataId));
              }
            }
          );
        })
      )
    );
  }

  selectedTrainingBooksCollapsed(): TrainingGroup[] {
    const continguousGroups: TrainingGroup[] = [];
    let currentGroup: TrainingBook[] = [];
    for (const book of this.userSelectedTrainingBooks) {
      const isBookConsecutiveAndMatching =
        book.source === currentGroup[0]?.source &&
        book.target === currentGroup[0]?.target &&
        book.number === currentGroup[currentGroup.length - 1]?.number + 1;
      if (currentGroup.length > 0 && !isBookConsecutiveAndMatching) {
        //process and reset current group
        addGroup(currentGroup, this.i18n);
        currentGroup.length = 0;
      }
      //add book to current group
      currentGroup.push(book);
    }

    //add last group
    if (currentGroup.length > 0) {
      addGroup(currentGroup, this.i18n);
    }

    const groupsCollapsed: TrainingGroup[] = [];
    for (const group of continguousGroups) {
      const matchIndex = groupsCollapsed.findIndex(g => g.source === group.source && g.target === group.target);
      if (matchIndex === -1) {
        //make a new group for this source/target
        groupsCollapsed.push(group);
      } else {
        //append the current group onto the matching group
        groupsCollapsed[matchIndex].ranges.push(group.ranges[0]);
      }
    }

    return groupsCollapsed;

    function addGroup(group: TrainingBook[], i18n: I18nService): void {
      let range;
      if (group.length === 1) {
        range = i18n.localizeBook(group[0].number);
      } else {
        range = i18n.localizeBook(group[0].number) + ' - ' + i18n.localizeBook(group[group.length - 1].number);
      }
      continguousGroups.push({ ranges: [range], source: group[0].source, target: group[0].target });
    }
  }

  onTrainingBookSelect(selectedBooks: number[]): void {
    const newBookSelections: number[] = selectedBooks.filter(
      b => this.userSelectedTrainingBooks.find(x => x.number === b) === undefined
    );
    this.userSelectedTrainingBooks = selectedBooks.map((bookNum: number) => ({
      number: bookNum,
      name: Canon.bookNumberToEnglishName(bookNum),
      source: this.trainingSources[0].shortName,
      target: this.trainingTargets[0].shortName
    }));
    this.selectableSourceTrainingBooks = [...selectedBooks];
    this.selectableAdditionalSourceTrainingBooks = this.availableAdditionalTrainingBooks.filter(b =>
      selectedBooks.includes(b)
    );

    // remove selected books that are no longer selectable
    this.userSelectedSourceTrainingBooks = this.userSelectedSourceTrainingBooks.filter(b => selectedBooks.includes(b));
    this.userSelectedAdditionalSourceTrainingBooks = this.userSelectedAdditionalSourceTrainingBooks.filter(b =>
      selectedBooks.includes(b)
    );

    // automatically select books that are newly selected as training books
    for (const bookNum of newBookSelections) {
      this.userSelectedSourceTrainingBooks.push(bookNum);
      if (this.selectableAdditionalSourceTrainingBooks.includes(bookNum)) {
        this.userSelectedAdditionalSourceTrainingBooks.push(bookNum);
      }
    }

    this.clearErrorMessage();
  }

  onTrainingDataSelect(selectedTrainingDataIds: string[]): void {
    this.selectedTrainingDataIds = selectedTrainingDataIds;
    this.clearErrorMessage();
  }

  onSourceTrainingBookSelect(selectedBooks: number[]): void {
    this.userSelectedSourceTrainingBooks = this.selectableSourceTrainingBooks.filter(b => selectedBooks.includes(b));
    this.clearErrorMessage();
  }

  onAdditionalSourceTrainingBookSelect(selectedBooks: number[]): void {
    this.userSelectedAdditionalSourceTrainingBooks = this.selectableAdditionalSourceTrainingBooks.filter(b =>
      selectedBooks.includes(b)
    );
    this.clearErrorMessage();
  }

  onTranslateBookSelect(selectedBooks: number[]): void {
    this.userSelectedTranslateBooks = selectedBooks.map((bookNum: number) => ({
      number: bookNum,
      name: Canon.bookNumberToEnglishName(bookNum)
    }));
    this.clearErrorMessage();
  }

  onStepChange(): void {
    this.clearErrorMessage();
    this.updateTrainingBooks();
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
      const trainingScriptureRange: ProjectScriptureRange | undefined =
        this.userSelectedSourceTrainingBooks.length > 0
          ? this.convertToScriptureRange(
              this.draftSourceProjectIds!.trainingAlternateSourceId ?? this.draftSourceProjectIds!.trainingSourceId,
              this.userSelectedSourceTrainingBooks
            )
          : undefined;

      const trainingScriptureRanges: ProjectScriptureRange[] = [];
      if (trainingScriptureRange != null) {
        trainingScriptureRanges.push(trainingScriptureRange);
      }
      // Use the additional training range if selected
      const useAdditionalTranslateRange: boolean = this.userSelectedAdditionalSourceTrainingBooks.length > 0;
      if (useAdditionalTranslateRange) {
        trainingScriptureRanges.push(
          this.convertToScriptureRange(
            this.draftSourceProjectIds!.trainingAdditionalSourceId,
            this.userSelectedAdditionalSourceTrainingBooks
          )
        );
      }
      this.done.emit({
        trainingScriptureRanges,
        trainingDataFiles: this.selectedTrainingDataIds,
        translationScriptureRange: this.userSelectedTranslateBooks.map(b => Canon.bookNumberToId(b.number)).join(';'),
        fastTraining: this.fastTraining
      });
    }
  }

  /**
   * Filter selected translate books from available/selected training books.
   * Currently, training books cannot be in the set of translate books,
   * but this requirement may be removed in the future.
   */
  updateTrainingBooks(): void {
    const selectedTranslateBooks = new Set<number>(this.userSelectedTranslateBooks.map(book => book.number));

    this.availableTrainingBooks = this.initialAvailableTrainingBooks.filter(
      bookNum => !selectedTranslateBooks.has(bookNum)
    );

    const newSelectedTrainingBooks = this.userSelectedTrainingBooks.filter(
      book => !selectedTranslateBooks.has(book.number)
    );

    this.initialSelectedTrainingBooks = newSelectedTrainingBooks.map(book => book.number);
    this.userSelectedTrainingBooks = [...newSelectedTrainingBooks];
    this.selectableSourceTrainingBooks = newSelectedTrainingBooks.map(book => book.number);
    this.userSelectedSourceTrainingBooks = newSelectedTrainingBooks.map(book => book.number);
    this.selectableAdditionalSourceTrainingBooks = this.availableAdditionalTrainingBooks.filter(b =>
      this.selectableSourceTrainingBooks.includes(b)
    );
    this.userSelectedAdditionalSourceTrainingBooks = this.selectableAdditionalSourceTrainingBooks.filter(b =>
      this.selectableSourceTrainingBooks.includes(b)
    );
  }

  bookNames(books: number[]): string {
    return this.i18n.enumerateList(books.map(bookNum => this.i18n.localizeBook(bookNum)));
  }

  private convertToScriptureRange(projectId: string, books: number[]): ProjectScriptureRange {
    return { projectId: projectId, scriptureRange: books.map(b => Canon.bookNumberToId(b)).join(';') };
  }

  private validateCurrentStep(): boolean {
    const isValid = this.stepper.selected?.completed!;
    this.showBookSelectionError = !isValid;
    return isValid;
  }

  private clearErrorMessage(): void {
    this.showBookSelectionError = false;
  }

  private setInitialTranslateBooks(availableBooks: number[]): void {
    // Get the previously selected translation books from the target project
    const previousTranslationRange: string =
      this.activatedProject.projectDoc?.data?.translateConfig.draftConfig.lastSelectedTranslationScriptureRange ?? '';
    const previousBooks: Set<number> = new Set<number>(booksFromScriptureRange(previousTranslationRange));

    // The intersection is all of the available books in the source project that match the target's previous books
    const intersection: number[] = availableBooks.filter(bookNum => previousBooks.has(bookNum));

    // Set the selected books to the intersection, or if the intersection is empty, do not select any
    this.initialSelectedTranslateBooks = intersection.length > 0 ? intersection : [];
    this.userSelectedTranslateBooks = this.initialSelectedTranslateBooks.map((bookNum: number) => ({
      number: bookNum,
      name: Canon.bookNumberToEnglishName(bookNum)
    }));
  }

  private setInitialTrainingBooks(availableBooks: number[]): void {
    // Get the previously selected training books from the target project
    const trainingSourceId =
      this.draftSourceProjectIds?.trainingAlternateSourceId ?? this.draftSourceProjectIds?.trainingSourceId;
    let previousTrainingRange: string =
      this.activatedProject.projectDoc?.data?.translateConfig.draftConfig.lastSelectedTrainingScriptureRanges?.find(
        r => r.projectId === trainingSourceId
      )?.scriptureRange ?? '';
    const trainingScriptureRange: string | undefined =
      this.activatedProject.projectDoc?.data?.translateConfig.draftConfig.lastSelectedTrainingScriptureRange;
    if (previousTrainingRange === '' && trainingScriptureRange != null) {
      previousTrainingRange = trainingScriptureRange;
    }
    const previousBooks: Set<number> = new Set<number>(booksFromScriptureRange(previousTrainingRange));

    // The intersection is all of the available books in the source project that match the target's previous books
    const intersection: number[] = availableBooks.filter(bookNum => previousBooks.has(bookNum));

    // Set the selected books to the intersection, or if the intersection is empty, do not select any
    this.initialSelectedTrainingBooks = intersection.length > 0 ? intersection : [];

    this.userSelectedTrainingBooks = this.initialSelectedTrainingBooks.map((bookNum: number) => ({
      number: bookNum,
      name: Canon.bookNumberToEnglishName(bookNum),
      source: this.trainingSources[0].shortName,
      target: this.trainingTargets[0].shortName
    }));
  }

  private setInitialTrainingDataFiles(availableDataFiles: string[]): void {
    // Get the previously selected training data files from the target project
    const previousTrainingDataFiles: string[] =
      this.activatedProject.projectDoc?.data?.translateConfig.draftConfig.lastSelectedTrainingDataFiles ?? [];

    // The intersection is all of the available training data files in the target project that match the target's
    // previous training data files
    const intersection: string[] = availableDataFiles.filter(dataId => previousTrainingDataFiles.includes(dataId));

    // Set the selected data files to the intersection, or if the intersection is empty, do not select any
    this.selectedTrainingDataIds = intersection.length > 0 ? intersection : [];
    this.trainingDataFilesAvailable =
      this.activatedProject.projectDoc?.data?.translateConfig.draftConfig.additionalTrainingData ?? false;
  }

  private setProjectDisplayNames(
    target: DraftSource | undefined,
    draftingSource: DraftSource | undefined,
    trainingSource: DraftSource | undefined,
    additionalTrainingSource: DraftSource | undefined
  ): void {
    this.targetProjectName = target != null ? projectLabel(target) : '';
    this.draftingSourceProjectName = draftingSource != null ? projectLabel(draftingSource) : '';
    this.trainingSourceProjectName =
      trainingSource != null ? projectLabel(trainingSource) : this.draftingSourceProjectName;
    this.trainingAdditionalSourceProjectName =
      additionalTrainingSource != null ? projectLabel(additionalTrainingSource) : '';
  }
}
