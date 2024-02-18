import { CommonModule } from '@angular/common';
import { Component, EventEmitter, OnInit, Output, ViewChild } from '@angular/core';
import { MatStepper } from '@angular/material/stepper';
import { TranslocoModule } from '@ngneat/transloco';
import { Canon } from '@sillsdev/scripture';
import { TranslocoMarkupModule } from 'ngx-transloco-markup';
import { filter } from 'rxjs/operators';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { BookMultiSelectComponent } from '../../../shared/book-multi-select/book-multi-select.component';
import { SharedModule } from '../../../shared/shared.module';
import { NllbLanguageService } from '../../nllb-language.service';
import { DraftSource, DraftSourcesService } from '../draft-sources.service';

export interface DraftGenerationStepsResult {
  trainingBooks: number[];
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
    BookMultiSelectComponent
  ]
})
export class DraftGenerationStepsComponent extends SubscriptionDisposable implements OnInit {
  @Output() done = new EventEmitter<DraftGenerationStepsResult>();
  @ViewChild(MatStepper) stepper!: MatStepper;

  availableTranslateBooks?: number[] = undefined;
  availableTrainingBooks: number[] = [];

  // Unusable books do not exist in the corresponding drafting/training source project
  unusableTranslateBooks: number[] = [];
  unusableTrainingBooks: number[] = [];

  initialSelectedTrainingBooks: number[] = [];
  initialSelectedTranslateBooks: number[] = [];
  userSelectedTrainingBooks: number[] = [];
  userSelectedTranslateBooks: number[] = [];

  // When translate books are selected, they will be filtered out from this list
  initialAvailableTrainingBooks: number[] = [];

  draftingSourceProjectName?: string;
  trainingSourceProjectName?: string;

  showBookSelectionError = false;
  isTrainingOptional = false;

  fastTraining: boolean = false;

  constructor(
    private readonly activatedProject: ActivatedProjectService,
    private readonly draftSourcesService: DraftSourcesService,
    readonly featureFlags: FeatureFlagService,
    private readonly nllbLanguageService: NllbLanguageService
  ) {
    super();
  }

  ngOnInit(): void {
    this.subscribe(
      this.draftSourcesService.getDraftProjectSources().pipe(
        filter(({ target, source, alternateSource, alternateTrainingSource }) => {
          this.setSourceProjectDisplayNames(alternateSource ?? source, alternateTrainingSource);
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
  }

  onTrainingBookSelect(selectedBooks: number[]): void {
    this.userSelectedTrainingBooks = selectedBooks;
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

  private setSourceProjectDisplayNames(
    draftingSource: DraftSource | undefined,
    trainingSource: DraftSource | undefined
  ): void {
    this.draftingSourceProjectName =
      draftingSource != null ? `${draftingSource.shortName} - ${draftingSource.name}` : '';
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
