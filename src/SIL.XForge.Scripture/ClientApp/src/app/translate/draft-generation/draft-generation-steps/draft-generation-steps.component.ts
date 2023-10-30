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
      tap((books: number[]) => {
        // Initially select all books
        // TODO: Initialize with selection from previous draft if available?
        // TODO: ...otherwise, initialize with books from target project that contain any translation work?
        this.selectedBooks = books;
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
