import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { from, Observable } from 'rxjs';
import { map, switchMap, tap } from 'rxjs/operators';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { SFProjectService } from '../../../core/sf-project.service';

export interface DraftGenerationStepsResult {
  books: number[];
}

@Component({
  selector: 'app-draft-generation-steps',
  templateUrl: './draft-generation-steps.component.html',
  styleUrls: ['./draft-generation-steps.component.scss']
})
export class DraftGenerationStepsComponent implements OnInit {
  @Output() done = new EventEmitter<DraftGenerationStepsResult>();

  availableBooks$?: Observable<number[]>;
  selectedBooks: number[] = [];

  constructor(
    private readonly activatedProject: ActivatedProjectService,
    private readonly projectService: SFProjectService
  ) {}

  ngOnInit(): void {
    this.availableBooks$ = this.activatedProject.projectDoc$.pipe(
      // Build available book list from source project
      switchMap(doc => {
        // See if there is an alternate project set
        let sourceProjectId: string | undefined = doc?.data?.translateConfig.draftConfig.alternateSource?.projectRef;
        if (sourceProjectId != null) {
          return from(this.projectService.getProfile(sourceProjectId));
        }

        // Otherwise, use the source project
        sourceProjectId = doc?.data?.translateConfig.source?.projectRef;

        if (sourceProjectId == null) {
          throw new Error('Source project is not set');
        }

        return from(this.projectService.getProfile(sourceProjectId));
      }),
      map(doc => doc?.data?.texts.map(t => t.bookNum) ?? []),
      tap((availableBooks: number[]) => {
        // Get the previous books from the target project
        const previousBooks: number[] =
          this.activatedProject.projectDoc?.data?.translateConfig.draftConfig.lastSelectedBooks ?? [];

        // The intersection is all of the available books in the source project that match the target's previous books
        const intersection = availableBooks.filter(bookNum => previousBooks.includes(bookNum));

        // Set the selected books to the intersection, or if the intersection is empty, just return all available books
        this.selectedBooks = intersection.length > 0 ? intersection : availableBooks;
      })
    );
  }

  onBookSelect(selectedBooks: number[]): void {
    this.selectedBooks = selectedBooks;
  }

  onDone(): void {
    this.done.emit({ books: this.selectedBooks });
  }
}
