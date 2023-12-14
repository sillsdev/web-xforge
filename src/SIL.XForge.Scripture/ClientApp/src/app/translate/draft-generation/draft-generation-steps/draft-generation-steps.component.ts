import { CommonModule } from '@angular/common';
import { Component, EventEmitter, OnInit, Output, ViewChild } from '@angular/core';
import { MatLegacyButtonModule as MatButtonModule } from '@angular/material/legacy-button';
import { MatStepper, MatStepperModule } from '@angular/material/stepper';
import { TranslocoModule } from '@ngneat/transloco';
import { Observable, from } from 'rxjs';
import { map, switchMap, tap } from 'rxjs/operators';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
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
  imports: [CommonModule, SharedModule, MatButtonModule, MatStepperModule, TranslocoModule, BookMultiSelectComponent]
})
export class DraftGenerationStepsComponent implements OnInit {
  @Output() done = new EventEmitter<DraftGenerationStepsResult>();
  @ViewChild(MatStepper) stepper!: MatStepper;

  availableBooks$?: Observable<number[]>;

  // Unusable books
  targetOnlyBooks: number[] = [];
  sourceOnlyBooks: number[] = [];

  initialSelectedTrainingBooks: number[] = [];
  initialSelectedTranslateBooks: number[] = [];
  userSelectedTrainingBooks: number[] = [];
  userSelectedTranslateBooks: number[] = [];

  showBookSelectionError = false;

  constructor(
    private readonly activatedProject: ActivatedProjectService,
    private readonly projectService: SFProjectService
  ) {}

  ngOnInit(): void {
    this.availableBooks$ = this.activatedProject.projectDoc$.pipe(
      // Build available book list from source project
      switchMap(targetDoc => {
        // See if there is an alternate source project set, otherwise use the source project
        let sourceProjectId: string | undefined =
          targetDoc?.data?.translateConfig.draftConfig.alternateSource?.projectRef ??
          targetDoc?.data?.translateConfig.source?.projectRef;

        if (sourceProjectId == null) {
          throw new Error('Source project is not set');
        }

        return from(this.projectService.getProfile(sourceProjectId)).pipe(map(sourceDoc => ({ targetDoc, sourceDoc })));
      }),
      map(({ targetDoc, sourceDoc }) => {
        const intersectionBooks = new Set<number>();
        const sourceOnlyBooks = new Set<number>();
        const targetOnlyBooks: number[] = [];

        for (const text of sourceDoc?.data?.texts ?? []) {
          sourceOnlyBooks.add(text.bookNum); // 'intersection' books will be removed from this set
        }

        for (const text of targetDoc?.data?.texts ?? []) {
          const bookNum = text.bookNum;

          if (sourceOnlyBooks.has(bookNum)) {
            intersectionBooks.add(bookNum);
            sourceOnlyBooks.delete(bookNum); // Remove 'intersection' books from source-only set
          } else {
            targetOnlyBooks.push(bookNum);
          }
        }

        // Set unusable books
        this.sourceOnlyBooks = Array.from(sourceOnlyBooks);
        this.targetOnlyBooks = targetOnlyBooks;

        // The books that are available have to be in both the source and target
        return Array.from(intersectionBooks);
      }),
      tap((availableBooks: number[]) => {
        this.setInitialTrainingBooks(availableBooks);
        this.setInitialTranslateBooks(availableBooks);
      })
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
}
