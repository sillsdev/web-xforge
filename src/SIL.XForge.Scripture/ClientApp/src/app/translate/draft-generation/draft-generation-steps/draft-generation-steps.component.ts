import { Component, EventEmitter, OnInit, Output, ViewChild } from '@angular/core';
import { MatStepper } from '@angular/material/stepper';
import { TranslocoModule } from '@ngneat/transloco';
import { Canon } from '@sillsdev/scripture';
import { TranslocoMarkupModule } from 'ngx-transloco-markup';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { TrainingData } from 'realtime-server/lib/esm/scriptureforge/models/training-data';
import { TranslateSource } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { Subscription, merge } from 'rxjs';
import { filter, tap } from 'rxjs/operators';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { I18nService } from 'xforge-common/i18n.service';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { filterNullish } from 'xforge-common/util/rxjs-util';
import { TrainingDataDoc } from '../../../core/models/training-data-doc';
import { BookMultiSelectComponent } from '../../../shared/book-multi-select/book-multi-select.component';
import { SharedModule } from '../../../shared/shared.module';
import { NllbLanguageService } from '../../nllb-language.service';
import { ConfirmSourcesComponent } from '../confirm-sources/confirm-sources.component';
import { DraftSource, DraftSourcesService } from '../draft-sources.service';
import { TrainingDataMultiSelectComponent } from '../training-data/training-data-multi-select.component';
import { TrainingDataUploadDialogComponent } from '../training-data/training-data-upload-dialog.component';
import { TrainingDataService } from '../training-data/training-data.service';

export interface DraftGenerationStepsResult {
  trainingBooks: number[];
  trainingDataFiles: string[];
  trainingScriptureRange?: string;
  translationBooks: number[];
  translationScriptureRange?: string;
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

  selectedTrainingDataIds: string[] = [];

  // When translate books are selected, they will be filtered out from this list
  initialAvailableTrainingBooks: number[] = [];

  draftingSourceProjectName?: string;
  trainingSourceProjectName?: string;
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
    protected readonly i18n: I18nService
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

  ngOnInit(): void {
    this.subscribe(
      this.draftSourcesService.getDraftProjectSources().pipe(
        filter(({ target, source, alternateSource, alternateTrainingSource }) => {
          this.setProjectDisplayNames(target, alternateSource ?? source, alternateTrainingSource);
          return target != null && source != null;
        })
      ),
      // Build book lists
      async ({ target, source, alternateSource, alternateTrainingSource }) => {
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
        let trainingSourceBooks = new Set<number>();

        for (const text of draftingSource.texts) {
          draftingSourceBooks.add(text.bookNum);
        }

        if (alternateTrainingSource != null) {
          for (const text of alternateTrainingSource.texts) {
            trainingSourceBooks.add(text.bookNum);
          }
        } else {
          // If no training source project, use drafting source project books
          trainingSourceBooks = draftingSourceBooks;
        }

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
    this.userSelectedTrainingBooks = selectedBooks.map((bookNum: number) => ({
      number: bookNum,
      name: this.i18n.localizeBook(bookNum),
      source: this.trainingSources[0].shortName,
      target: this.trainingTargets[0].shortName
    }));
    this.clearErrorMessage();
  }

  onTrainingDataSelect(selectedTrainingDataIds: string[]): void {
    this.selectedTrainingDataIds = selectedTrainingDataIds;
    this.clearErrorMessage();
  }

  onTranslateBookSelect(selectedBooks: number[]): void {
    this.userSelectedTranslateBooks = selectedBooks.map((bookNum: number) => ({
      number: bookNum,
      name: this.i18n.localizeBook(bookNum)
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
      this.isStepsCompleted = true;
      this.done.emit({
        trainingBooks: this.userSelectedTrainingBooks.map(book => book.number),
        trainingDataFiles: this.selectedTrainingDataIds,
        translationBooks: this.userSelectedTranslateBooks.map(book => book.number),
        fastTraining: this.fastTraining
      });
    }
  }

  selectedTranslateBooks(): string {
    return this.i18n.enumerateList(this.userSelectedTranslateBooks.map(b => this.i18n.localizeBook(b.number)));
  }

  /**
   * Filter selected translate books from available/selected training books.
   * Currently, training books cannot in the set of translate books,
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
    this.userSelectedTrainingBooks = newSelectedTrainingBooks;
  }

  get firstTrainingSource(): string {
    return this.trainingSources[0].shortName;
  }

  bookNames(books: number[]): string {
    return this.i18n.enumerateList(books.map(bookNum => this.i18n.localizeBook(bookNum)));
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
    const previousBooks: Set<number> = new Set<number>(
      this.activatedProject.projectDoc?.data?.translateConfig.draftConfig.lastSelectedTranslationBooks ?? []
    );

    // The intersection is all of the available books in the source project that match the target's previous books
    const intersection = availableBooks.filter(bookNum => previousBooks.has(bookNum));

    // Set the selected books to the intersection, or if the intersection is empty, do not select any
    this.initialSelectedTranslateBooks = intersection.length > 0 ? intersection : [];
    this.userSelectedTranslateBooks = this.initialSelectedTranslateBooks.map((bookNum: number) => ({
      number: bookNum,
      name: this.i18n.localizeBook(bookNum)
    }));
  }

  private setInitialTrainingBooks(availableBooks: number[]): void {
    // Get the previously selected training books from the target project
    const previousBooks: Set<number> = new Set<number>(
      this.activatedProject.projectDoc?.data?.translateConfig.draftConfig.lastSelectedTrainingBooks ?? []
    );

    // The intersection is all of the available books in the source project that match the target's previous books
    const intersection = availableBooks.filter(bookNum => previousBooks.has(bookNum));

    // Set the selected books to the intersection, or if the intersection is empty, do not select any
    this.initialSelectedTrainingBooks = intersection.length > 0 ? intersection : [];

    this.userSelectedTrainingBooks = this.initialSelectedTrainingBooks.map((bookNum: number) => ({
      number: bookNum,
      name: this.i18n.localizeBook(bookNum),
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
    trainingSource: DraftSource | undefined
  ): void {
    this.targetProjectName = target != null ? `${target.shortName} - ${target.name}` : '';
    this.draftingSourceProjectName =
      draftingSource != null ? `${draftingSource.shortName} - ${draftingSource.name}` : '';
    this.trainingSourceProjectName =
      trainingSource != null ? `${trainingSource.shortName} - ${trainingSource.name}` : this.draftingSourceProjectName;
  }
}
