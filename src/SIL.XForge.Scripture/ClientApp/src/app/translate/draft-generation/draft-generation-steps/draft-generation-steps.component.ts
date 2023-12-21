import { CommonModule } from '@angular/common';
import { Component, EventEmitter, OnInit, Output, ViewChild } from '@angular/core';
import { MatLegacyButtonModule as MatButtonModule } from '@angular/material/legacy-button';
import { MatStepper, MatStepperModule } from '@angular/material/stepper';
import { TranslocoModule } from '@ngneat/transloco';
import { TranslocoMarkupModule } from 'ngx-transloco-markup';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { TranslateConfig } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { from } from 'rxjs';
import { map, switchMap, tap } from 'rxjs/operators';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { SFProjectService } from '../../../core/sf-project.service';
import { BookMultiSelectComponent } from '../../../shared/book-multi-select/book-multi-select.component';
import { SharedModule } from '../../../shared/shared.module';

export interface DraftGenerationStepsResult {
  trainingBooks: number[];
  translationBooks: number[];
}

@Component({
  selector: 'app-draft-generation-steps',
  templateUrl: './draft-generation-steps.component.html',
  styleUrls: ['./draft-generation-steps.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    SharedModule,
    MatButtonModule,
    MatStepperModule,
    TranslocoModule,
    TranslocoMarkupModule,
    BookMultiSelectComponent
  ]
})
export class DraftGenerationStepsComponent extends SubscriptionDisposable implements OnInit {
  @Output() done = new EventEmitter<DraftGenerationStepsResult>();
  @ViewChild(MatStepper) stepper!: MatStepper;

  availableTranslateBooks: number[] = [];
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

  constructor(
    private readonly activatedProject: ActivatedProjectService,
    private readonly projectService: SFProjectService
  ) {
    super();
  }

  ngOnInit(): void {
    this.subscribe(
      this.activatedProject.projectDoc$.pipe(
        // Build available book list from source project(s)
        switchMap(targetDoc => {
          const translateConfig: TranslateConfig | undefined = targetDoc?.data?.translateConfig;

          // See if there is an alternate source project set, otherwise use the drafting source project
          const draftingSourceProjectId: string | undefined =
            translateConfig?.draftConfig.alternateSource?.projectRef ?? translateConfig?.source?.projectRef;

          if (draftingSourceProjectId == null) {
            throw new Error('Source project is not set');
          }

          const trainingSourceProjectId = translateConfig?.draftConfig.alternateTrainingSourceEnabled
            ? translateConfig.draftConfig.alternateTrainingSource?.projectRef
            : undefined;

          // Include alternate training source project if it exists
          return from(
            Promise.all([
              this.projectService.getProfile(draftingSourceProjectId),
              trainingSourceProjectId
                ? this.projectService.getProfile(trainingSourceProjectId)
                : Promise.resolve(undefined)
            ])
          ).pipe(
            map(([draftingSourceDoc, trainingSourceDoc]) => {
              if (targetDoc?.data == null || draftingSourceDoc?.data == null) {
                throw new Error('Target project or drafting source project data not found');
              }

              return {
                target: targetDoc.data,
                draftingSource: draftingSourceDoc.data,
                trainingSource: trainingSourceDoc?.data
              };
            })
          );
        }),
        tap(({ draftingSource, trainingSource }) => {
          this.setSourceProjectDisplayNames(draftingSource, trainingSource);
        })
      ),
      // Build book lists
      ({ target, draftingSource, trainingSource }) => {
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
        translationBooks: this.userSelectedTranslateBooks
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
