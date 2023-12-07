import { CommonModule } from '@angular/common';
import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { MatLegacyButtonModule as MatButtonModule } from '@angular/material/legacy-button';
import { MatStepperModule } from '@angular/material/stepper';
import { TranslocoModule } from '@ngneat/transloco';
import { from, Observable } from 'rxjs';
import { map, switchMap, tap } from 'rxjs/operators';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { SFProjectService } from '../../../core/sf-project.service';
import { BookMultiSelectComponent } from '../../../shared/book-multi-select/book-multi-select.component';

export interface DraftGenerationStepsResult {
  trainingBooks: number[];
  translationBooks: number[];
}

@Component({
  selector: 'app-draft-generation-steps',
  templateUrl: './draft-generation-steps.component.html',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatStepperModule, TranslocoModule, BookMultiSelectComponent],
  styleUrls: ['./draft-generation-steps.component.scss']
})
export class DraftGenerationStepsComponent implements OnInit {
  @Output() done = new EventEmitter<DraftGenerationStepsResult>();

  availableBooks$?: Observable<number[]>;
  availableBooks: number[] = [];

  initialSelectedTrainingBooks: number[] = [];
  initialSelectedTranslateBooks: number[] = [];
  userSelectedTrainingBooks: number[] = [];
  userSelectedTranslateBooks: number[] = [];
  isAlternateTrainingSourceEnabled: boolean =
    this.activatedProject.projectDoc?.data?.translateConfig.draftConfig.alternateTrainingSourceEnabled ?? false;

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
        // Get the source books
        const sourceBooks: number[] = sourceDoc?.data?.texts.map(t => t.bookNum) ?? [];

        // Get the books available in the target
        const targetBooks: Set<number> = new Set<number>(targetDoc?.data?.texts.map(t => t.bookNum) ?? []);

        // The books that are available have to be in the source and target
        return sourceBooks.filter(bookNum => targetBooks.has(bookNum));
      }),
      tap((availableBooks: number[]) => {
        // The list of available books will be used to calculate what was not selected
        this.availableBooks = availableBooks;

        this.setInitialTrainingBooks(availableBooks);
        this.setInitialTranslateBooks(availableBooks);
      })
    );
  }

  onTrainingBookSelect(selectedBooks: number[]): void {
    this.userSelectedTrainingBooks = selectedBooks;
  }

  onTranslateBookSelect(selectedBooks: number[]): void {
    this.userSelectedTranslateBooks = selectedBooks;
  }

  onDone(): void {
    // If alternate training source not enabled, books not selected will be the translation books
    if (!this.isAlternateTrainingSourceEnabled) {
      const selectedBooks: Set<number> = new Set<number>(this.userSelectedTrainingBooks);
      this.userSelectedTranslateBooks = this.availableBooks.filter(bookNum => !selectedBooks.has(bookNum));
    }

    this.done.emit({
      trainingBooks: this.userSelectedTrainingBooks,
      translationBooks: this.userSelectedTranslateBooks
    });
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
