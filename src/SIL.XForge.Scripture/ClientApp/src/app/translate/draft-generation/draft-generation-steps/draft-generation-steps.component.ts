import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';

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

  constructor(private readonly activatedProject: ActivatedProjectService) {}

  ngOnInit(): void {
    this.availableBooks$ = this.activatedProject.projectDoc$.pipe(
      map(doc => doc?.data?.texts.map(t => t.bookNum) ?? []),
      tap((books: number[]) => {
        // Initially select all books
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
