import { CommonModule } from '@angular/common';
import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { MatLegacyButtonModule as MatButtonModule } from '@angular/material/legacy-button';
import { TranslocoModule } from '@ngneat/transloco';
import { from, Observable } from 'rxjs';
import { map, switchMap, tap } from 'rxjs/operators';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { SFProjectService } from '../../../core/sf-project.service';
import { BookMultiSelectComponent } from '../../../shared/book-multi-select/book-multi-select.component';

export interface DraftGenerationStepsResult {
  books: number[];
}

@Component({
  selector: 'app-draft-generation-steps',
  templateUrl: './draft-generation-steps.component.html',
  standalone: true,
  imports: [CommonModule, MatButtonModule, TranslocoModule, BookMultiSelectComponent],
  styleUrls: ['./draft-generation-steps.component.scss']
})
export class DraftGenerationStepsComponent implements OnInit {
  @Output() done = new EventEmitter<DraftGenerationStepsResult>();

  availableBooks$?: Observable<number[]>;
  initialSelectedBooks: number[] = [];
  finalSelectedBooks: number[] = [];

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
        // Get the previously selected training books from the target project
        const previousBooks: Set<number> = new Set<number>(
          this.activatedProject.projectDoc?.data?.translateConfig.draftConfig.lastSelectedBooks ?? []
        );

        // The intersection is all of the available books in the source project that match the target's previous books
        const intersection = availableBooks.filter(bookNum => previousBooks.has(bookNum));

        // Set the selected books to the intersection, or if the intersection is empty, just return all available books
        this.initialSelectedBooks = intersection.length > 0 ? intersection : availableBooks;
        this.finalSelectedBooks = this.initialSelectedBooks;
      })
    );
  }

  onBookSelect(selectedBooks: number[]): void {
    this.finalSelectedBooks = selectedBooks;
  }

  onDone(): void {
    this.done.emit({ books: this.finalSelectedBooks });
  }
}
