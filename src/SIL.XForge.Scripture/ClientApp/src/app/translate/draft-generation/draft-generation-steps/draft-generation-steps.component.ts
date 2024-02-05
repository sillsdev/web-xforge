import { CommonModule } from '@angular/common';
import { Component, EventEmitter, OnInit, Output, ViewChild } from '@angular/core';
import { MatStepper } from '@angular/material/stepper';
import { TranslocoModule } from '@ngneat/transloco';
import { Canon } from '@sillsdev/scripture';
import { TranslocoMarkupModule } from 'ngx-transloco-markup';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { TrainingData } from 'realtime-server/lib/esm/scriptureforge/models/training-data';
import { merge, Subscription } from 'rxjs';
import { tap } from 'rxjs/operators';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { filterNullish } from 'xforge-common/util/rxjs-util';
import { TrainingDataDoc } from '../../../core/models/training-data-doc';
import { BookMultiSelectComponent } from '../../../shared/book-multi-select/book-multi-select.component';
import { SharedModule } from '../../../shared/shared.module';
import { NllbLanguageService } from '../../nllb-language.service';
import { DraftSourcesService } from '../draft-sources.service';
import { TrainingDataMultiSelectComponent } from '../training-data/training-data-multi-select.component';
import { TrainingDataUploadDialogComponent } from '../training-data/training-data-upload-dialog.component';
import { TrainingDataService } from '../training-data/training-data.service';

export interface DraftGenerationStepsResult {
  trainingBooks: number[];
  trainingDataFiles: string[];
  translationBooks: number[];
  fastTraining: boolean;
}

@Component({
  selector: 'app-draft-generation-steps',
  templateUrl: './draft-generation-steps.component.html',
  styleUrls: ['./draft-generation-steps.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    SharedModule,
    UICommonModule,
    TranslocoModule,
    TranslocoMarkupModule,
    BookMultiSelectComponent,
    TrainingDataMultiSelectComponent,
    TrainingDataUploadDialogComponent
  ]
})
export class DraftGenerationStepsComponent extends SubscriptionDisposable implements OnInit {
  @Output() done = new EventEmitter<DraftGenerationStepsResult>();
  @ViewChild(MatStepper) stepper!: MatStepper;

  availableTranslateBooks: number[] = [];
  availableTrainingBooks: number[] = [];
  availableTrainingData: Readonly<TrainingData>[] = [];

  // Unusable books do not exist in the corresponding drafting/training source project
  unusableTranslateBooks: number[] = [];
  unusableTrainingBooks: number[] = [];

  initialSelectedTrainingBooks: number[] = [];
  initialSelectedTrainingDataIds: string[] = [];
  initialSelectedTranslateBooks: number[] = [];
  userSelectedTrainingBooks: number[] = [];
  userSelectedTrainingDataIds: string[] = [];
  userSelectedTranslateBooks: number[] = [];

  // When translate books are selected, they will be filtered out from this list
  initialAvailableTrainingBooks: number[] = [];

  draftingSourceProjectName?: string;
  trainingSourceProjectName?: string;

  showBookSelectionError = false;
  isTrainingOptional = false;

  trainingDataFilesAvailable = false;
  fastTraining: boolean = false;

  private trainingDataQuery?: RealtimeQuery<TrainingDataDoc>;
  private trainingDataSub?: Subscription;

  constructor(
    private readonly activatedProject: ActivatedProjectService,
    private readonly draftSourcesService: DraftSourcesService,
    readonly featureFlags: FeatureFlagService,
    private readonly nllbLanguageService: NllbLanguageService,
    private readonly trainingDataService: TrainingDataService
  ) {
    super();
  }

  ngOnInit(): void {
    this.subscribe(
      this.draftSourcesService.getDraftProjectSources().pipe(
        tap(({ draftingSource, trainingSource }) => {
          this.setSourceProjectDisplayNames(draftingSource, trainingSource);
        })
      ),
      // Build book lists
      ({ target, draftingSource, trainingSource }) => {
        // If both source and target project languages are in the NLLB,
        // training book selection is optional (and discouraged).
        this.isTrainingOptional =
          this.nllbLanguageService.isNllbLanguage(target.writingSystem.tag) &&
          this.nllbLanguageService.isNllbLanguage(draftingSource.writingSystem.tag);

        const draftingSourceBooks = new Set<number>();
        let trainingSourceBooks = new Set<number>();

        for (const text of draftingSource.texts) {
          draftingSourceBooks.add(text.bookNum);
        }

        if (trainingSource != null) {
          for (const text of trainingSource.texts) {
            trainingSourceBooks.add(text.bookNum);
          }
        } else {
          // If no training source project, use drafting source project books
          trainingSourceBooks = draftingSourceBooks;
        }

        // If book exists in both target and source, add to available books.
        // Otherwise, add to unusable books.
        // Ensure books are displayed in ascending canonical order.
        for (const text of target.texts.sort((a, b) => a.bookNum - b.bookNum)) {
          const bookNum = text.bookNum;

          // Exclude non-canonical books
          if (Canon.isExtraMaterial(bookNum)) {
            continue;
          }

          // Translate books
          if (draftingSourceBooks.has(bookNum)) {
            this.availableTranslateBooks.push(bookNum);
          } else {
            this.unusableTranslateBooks.push(bookNum);
          }

          // Training books
          if (trainingSourceBooks.has(bookNum)) {
            this.availableTrainingBooks.push(bookNum);
          } else {
            this.unusableTrainingBooks.push(bookNum);
          }
        }

        // Store initially available training books that will be filtered to remove user selected translate books
        this.initialAvailableTrainingBooks = this.availableTrainingBooks;

        this.setInitialTrainingBooks(this.availableTrainingBooks);
        this.setInitialTranslateBooks(this.availableTranslateBooks);
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
              if (projectDoc.data?.translateConfig.draftConfig.additionalTrainingData) {
                this.availableTrainingData =
                  this.trainingDataQuery?.docs.filter(d => d.data != null).map(d => d.data!) ?? [];
              } else {
                this.availableTrainingData = [];
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

  onTrainingBookSelect(selectedBooks: number[]): void {
    this.userSelectedTrainingBooks = selectedBooks;
    this.clearErrorMessage();
  }

  onTrainingDataSelect(selectedTrainingDataIds: string[]): void {
    this.userSelectedTrainingDataIds = selectedTrainingDataIds;
    // If any of the passed data ids are not in the initial selected list, update the initial selected list
    if (!selectedTrainingDataIds.every(dataId => this.initialSelectedTrainingDataIds.includes(dataId))) {
      this.initialSelectedTrainingDataIds = selectedTrainingDataIds;
    }
    this.clearErrorMessage();
  }

  onTranslateBookSelect(selectedBooks: number[]): void {
    this.userSelectedTranslateBooks = selectedBooks;
    this.clearErrorMessage();
  }

  onStepChange(): void {
    this.clearErrorMessage();
  }

  tryAdvanceStep(): void {
    if (!this.validateCurrentStep()) {
      return;
    }

    if (this.stepper.selected !== this.stepper.steps.last) {
      this.updateTrainingBooks(); // Filter selected translate books from available/selected training books
      this.stepper.next();
    } else {
      this.done.emit({
        trainingBooks: this.userSelectedTrainingBooks,
        trainingDataFiles: this.userSelectedTrainingDataIds,
        translationBooks: this.userSelectedTranslateBooks,
        fastTraining: this.fastTraining
      });
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

  private setInitialTranslateBooks(availableBooks: number[]): void {
    // Get the previously selected translation books from the target project
    const previousBooks: Set<number> = new Set<number>(
      this.activatedProject.projectDoc?.data?.translateConfig.draftConfig.lastSelectedTranslationBooks ?? []
    );

    // The intersection is all of the available books in the source project that match the target's previous books
    const intersection = availableBooks.filter(bookNum => previousBooks.has(bookNum));

    // Set the selected books to the intersection, or if the intersection is empty, do not select any
    this.initialSelectedTranslateBooks = intersection.length > 0 ? intersection : [];
    this.userSelectedTranslateBooks = this.initialSelectedTranslateBooks;
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
    this.userSelectedTrainingBooks = this.initialSelectedTrainingBooks;
  }

  private setInitialTrainingDataFiles(availableDataFiles: string[]): void {
    // Get the previously selected training data files from the target project
    const previousTrainingDataFiles: string[] =
      this.activatedProject.projectDoc?.data?.translateConfig.draftConfig.lastSelectedTrainingDataFiles ?? [];

    // The intersection is all of the available training data files in the target project that match the target's
    // previous training data files
    const intersection: string[] = availableDataFiles.filter(dataId => previousTrainingDataFiles.includes(dataId));

    // Set the selected data files to the intersection, or if the intersection is empty, do not select any
    this.initialSelectedTrainingDataIds = intersection.length > 0 ? intersection : [];
    this.userSelectedTrainingDataIds = this.initialSelectedTrainingDataIds;
    this.trainingDataFilesAvailable =
      this.activatedProject.projectDoc?.data?.translateConfig.draftConfig.additionalTrainingData ?? false;
  }

  private setSourceProjectDisplayNames(
    draftingSource: SFProjectProfile,
    trainingSource: SFProjectProfile | undefined
  ): void {
    this.draftingSourceProjectName = `${draftingSource.shortName} - ${draftingSource.name}`;
    this.trainingSourceProjectName =
      trainingSource != null ? `${trainingSource.shortName} - ${trainingSource.name}` : this.draftingSourceProjectName;
  }

  /**
   * Filter selected translate books from available/selected training books.
   * Currently, training books cannot in the set of translate books,
   * but this requirement may be removed in the future.
   */
  private updateTrainingBooks(): void {
    const selectedTranslateBooks = new Set<number>(this.userSelectedTranslateBooks);

    this.availableTrainingBooks = this.initialAvailableTrainingBooks.filter(
      bookNum => !selectedTranslateBooks.has(bookNum)
    );

    const newSelectedTrainingBooks = this.userSelectedTrainingBooks.filter(
      bookNum => !selectedTranslateBooks.has(bookNum)
    );

    this.initialSelectedTrainingBooks = newSelectedTrainingBooks;
    this.userSelectedTrainingBooks = newSelectedTrainingBooks;
  }
}
