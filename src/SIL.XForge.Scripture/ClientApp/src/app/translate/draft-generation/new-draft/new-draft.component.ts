import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { Canon } from '@sillsdev/scripture';
import { filter, firstValueFrom } from 'rxjs';
import { JsonViewerComponent } from 'src/app/shared/json-viewer/json-viewer.component';
import { hasStringProp } from '../../../../type-utils';
import { ActivatedProjectService } from '../../../../xforge-common/activated-project.service';
import { I18nService } from '../../../../xforge-common/i18n.service';
import { Book } from '../../../shared/book-multi-select/book-multi-select';
import { BookMultiSelectComponent } from '../../../shared/book-multi-select/book-multi-select.component';
import { ConfirmSourcesComponent } from '../confirm-sources/confirm-sources.component';
import { DraftSourcesService } from '../draft-sources.service';
import {
  NewDraftLogicHandler,
  scriptureRangeToBookListWithoutChapterDetail,
  StubProgressServiceThatGivesChapterLevelInfo
} from './new-draft-logic-handler';

// TODO impelement a step to sync sources first
const PAGES_BY_ORDER = [
  { page: 'preface' },
  { page: 'draft_books', inputState: 'draft_books' },
  { page: 'training_books', inputState: 'training_books' },
  { page: 'suffix' }
] as const;

@Component({
  selector: 'app-new-draft',
  templateUrl: './new-draft.component.html',
  styleUrls: ['./new-draft.component.scss'],
  imports: [
    MatProgressSpinner,
    ConfirmSourcesComponent,
    MatButtonModule,
    MatIconModule,
    JsonViewerComponent,
    BookMultiSelectComponent
  ]
})
export class NewDraftComponent {
  logicHandler: NewDraftLogicHandler;

  page: (typeof PAGES_BY_ORDER)[number]['page'] | 'loading' = 'loading';

  constructor(
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly draftSourcesService: DraftSourcesService,
    private readonly progressService: StubProgressServiceThatGivesChapterLevelInfo,
    readonly i18n: I18nService,
    private readonly router: Router
  ) {
    this.logicHandler = new NewDraftLogicHandler(
      this.activatedProjectService,
      this.draftSourcesService,
      this.progressService
    );

    void this.init();
  }

  async init(): Promise<void> {
    await firstValueFrom(this.logicHandler.status$.pipe(filter(status => status === 'input')));
    this.page = 'preface';
  }

  back(): void {
    this.step(-1);
  }

  next(): void {
    this.step(1);
  }

  private step(count: 1 | -1): void {
    const currentIndex = PAGES_BY_ORDER.findIndex(p => p.page === this.page);
    const newIndex = currentIndex + count;
    if (newIndex < 0) {
      void this.router.navigate(['/projects', this.activatedProjectService.projectId, 'draft-generation']);
    } else if (newIndex < PAGES_BY_ORDER.length) {
      const newPage = PAGES_BY_ORDER[newIndex];
      this.page = newPage.page;
      if (hasStringProp(newPage, 'inputState')) {
        this.logicHandler.setInputMode(newPage.inputState as 'draft_books' | 'training_books');
      }
    } else throw new Error(`Cannot navigate from page ${this.page} to index ${newIndex}`);
  }

  async generateDraftClicked(): Promise<void> {
    // FIXME DO_NOT_MERGE
    throw new Error('Draft generation not implemented yet');
  }

  get debugData(): unknown {
    return {
      status: this.logicHandler.status$.getValue(),
      inputMode: this.logicHandler.inputMode$.getValue(),
      availableDraftingScriptureRange: this.logicHandler.availableDraftingScriptureRange$.getValue(),
      selectedDraftingScriptureRange: this.logicHandler.selectedDraftingScriptureRange$.getValue(),

      availableTargetTrainingScriptureRange: this.logicHandler.availableTargetTrainingScriptureRange$.getValue(),
      selectedTargetTrainingScriptureRange: this.logicHandler.selectedTargetTrainingScriptureRange$.getValue(),

      trainingSourceBooks: this.logicHandler.trainingSourceBooks$.getValue(),
      availableTrainingSourceBooks: this.logicHandler.availableTrainingSourceBooks$.getValue(),
      selectedTrainingSourceBooks: this.logicHandler.selectedTrainingSourceBooks$.getValue(),

      booksOfferedForPartialDrafting: this.logicHandler.booksOfferedForPartialDrafting$.getValue(),

      trainingBooksEdited: this.logicHandler.trainingBooksEdited
    };
  }

  get availableDraftingBooks(): Book[] {
    return scriptureRangeToBookListWithoutChapterDetail(
      this.logicHandler.availableDraftingScriptureRange$.getValue()
    ).map(id => ({
      number: Canon.bookIdToNumber(id),
      selected: this.selectedDraftingBooks.some(book => book.number === Canon.bookIdToNumber(id))
    }));
  }

  get selectedDraftingBooks(): Book[] {
    return scriptureRangeToBookListWithoutChapterDetail(
      this.logicHandler.selectedDraftingScriptureRange$.getValue()
    ).map(id => ({
      number: Canon.bookIdToNumber(id),
      selected: true
    }));
  }

  onDraftingBookSelect(books: number[]): void {
    const selectedBookIds = books.map(b => Canon.bookNumberToId(b));
    this.logicHandler.selectDraftingBooks(selectedBookIds);
  }
}
