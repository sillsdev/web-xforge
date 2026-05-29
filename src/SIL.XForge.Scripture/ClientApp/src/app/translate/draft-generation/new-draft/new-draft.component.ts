import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { Canon } from '@sillsdev/scripture';
import { filter, firstValueFrom } from 'rxjs';
import { DevOnlyComponent } from 'src/app/shared/dev-only/dev-only.component';
import { JsonViewerComponent } from 'src/app/shared/json-viewer/json-viewer.component';
import { hasStringProp } from '../../../../type-utils';
import { ActivatedProjectService } from '../../../../xforge-common/activated-project.service';
import { I18nKeyForComponent, I18nService } from '../../../../xforge-common/i18n.service';
import { filterNullish } from '../../../../xforge-common/util/rxjs-util';
import { Book } from '../../../shared/book-multi-select/book-multi-select';
import { BookMultiSelectComponent } from '../../../shared/book-multi-select/book-multi-select.component';
import { ConfirmSourcesComponent } from '../confirm-sources/confirm-sources.component';
import { DraftSource } from '../draft-source';
import { DraftSourcesService } from '../draft-sources.service';
import {
  NewDraftLogicHandler,
  ProgressServiceThatGivesChapterLevelInfo,
  scriptureRangeToBookListWithoutChapterDetail
} from './new-draft-logic-handler';
import { ChapterSet } from './scripture-range';

type ChapterInputError = { key: I18nKeyForComponent<'draft_wizard'>; params?: object };

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
    BookMultiSelectComponent,
    MatFormFieldModule,
    MatInputModule,
    DevOnlyComponent,
    TranslocoModule
  ]
})
export class NewDraftComponent {
  logicHandler: NewDraftLogicHandler;

  page: (typeof PAGES_BY_ORDER)[number]['page'] | 'loading' = 'loading';

  draftingChapterErrors = new Map<string, ChapterInputError>();
  targetTrainingChapterErrors = new Map<string, ChapterInputError>();
  stepError: I18nKeyForComponent<'draft_wizard'> | null = null;

  // Data that is guarnateed to be loaded post init
  initData?: { projectId: string };

  constructor(
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly draftSourcesService: DraftSourcesService,
    private readonly progressService: ProgressServiceThatGivesChapterLevelInfo,
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
    this.initData = {
      projectId: await firstValueFrom(this.activatedProjectService.projectId$.pipe(filterNullish()))
    };
    this.page = 'preface';
  }

  back(): void {
    this.step(-1);
  }

  next(): void {
    this.step(1);
  }

  private step(count: 1 | -1): void {
    if (count === 1) {
      if (this.page === 'draft_books' && this.draftingChapterErrors.size > 0) {
        this.stepError = 'fix_chapter_errors';
        return;
      }
      if (this.page === 'training_books' && this.targetTrainingChapterErrors.size > 0) {
        this.stepError = 'fix_chapter_errors';
        return;
      }
    }
    this.stepError = null;
    const currentIndex = PAGES_BY_ORDER.findIndex(p => p.page === this.page);
    const newIndex = currentIndex + count;
    if (newIndex < 0) {
      void this.router.navigate(['/projects', this.initData?.projectId, 'draft-generation']);
    } else if (newIndex < PAGES_BY_ORDER.length) {
      const newPage = PAGES_BY_ORDER[newIndex];
      this.page = newPage.page;
      if (hasStringProp(newPage, 'inputState')) {
        this.draftingChapterErrors.clear();
        this.targetTrainingChapterErrors.clear();
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
      availableDraftingScriptureRange: this.logicHandler.availableDraftingScriptureRange$.getValue().toString(),
      selectedDraftingScriptureRange: this.logicHandler.selectedDraftingScriptureRange$.getValue().toString(),

      availableTargetTrainingScriptureRange: this.logicHandler.availableTargetTrainingScriptureRange$
        .getValue()
        .toString(),
      selectedTargetTrainingScriptureRange: this.logicHandler.selectedTargetTrainingScriptureRange$
        .getValue()
        .toString(),

      booksOfferedForPartialDrafting: this.logicHandler.booksOfferedForPartialDrafting$.getValue(),
      booksOfferedForPartialTargetTraining: this.logicHandler.booksOfferedForPartialTargetTraining$.getValue(),

      trainingSourceBooks: this.logicHandler.trainingSourceBooks$.getValue(),
      availableTrainingSourceBooks: this.logicHandler.availableTrainingSourceBooks$.getValue(),
      selectedTrainingSourceBooks: this.logicHandler.selectedTrainingSourceBooks$.getValue()
    };
  }

  // Section: Drafting books selection

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

  get booksOfferedForPartialDrafting(): string[] {
    return this.logicHandler.booksOfferedForPartialDrafting$.getValue();
  }

  onDraftingBookSelect(books: number[]): void {
    const selectedBookIds = books.map(b => Canon.bookNumberToId(b));
    this.logicHandler.selectDraftingBooks(selectedBookIds);
    for (const bookId of this.draftingChapterErrors.keys()) {
      if (!this.logicHandler.booksOfferedForPartialDrafting$.getValue().includes(bookId)) {
        this.draftingChapterErrors.delete(bookId);
      }
    }
  }

  onDraftingChaptersBlurred(bookId: string, value: string): void {
    let parsed: ChapterSet;
    try {
      parsed = new ChapterSet(value);
    } catch {
      this.draftingChapterErrors.set(bookId, { key: 'chapter_input.invalid_range' });
      return;
    }

    const available = this.logicHandler.availableDraftingScriptureRange$.getValue().books.get(bookId);
    const badChapters = available != null ? parsed.difference(available) : parsed;
    if (badChapters.count() > 0) {
      this.draftingChapterErrors.set(bookId, {
        key: 'chapter_input.chapters_not_in_source',
        params: {
          chapters: badChapters.toString(),
          sourceName: this.logicHandler.sources?.draftingSources[0]?.shortName ?? ''
        }
      });
      return;
    }

    this.draftingChapterErrors.delete(bookId);
    this.logicHandler.selectDraftingChapters(bookId, value);
  }

  draftingRangeForBook(bookId: string): string {
    const range = this.logicHandler.selectedDraftingScriptureRange$.getValue();
    return range.books.get(bookId)?.toString() ?? '';
  }

  draftingChapterHint(bookId: string): string {
    return this.logicHandler.availableDraftingScriptureRange$.getValue().books.get(bookId)?.toString() ?? '';
  }

  // Section: Target training books selection

  get availableTargetTrainingBooks(): Book[] {
    return scriptureRangeToBookListWithoutChapterDetail(
      this.logicHandler.availableTargetTrainingScriptureRange$.getValue()
    ).map(id => ({
      number: Canon.bookIdToNumber(id),
      selected: this.selectedTargetTrainingBooks.some(book => book.number === Canon.bookIdToNumber(id))
    }));
  }

  get selectedTargetTrainingBooks(): Book[] {
    return scriptureRangeToBookListWithoutChapterDetail(
      this.logicHandler.selectedTargetTrainingScriptureRange$.getValue()
    ).map(id => ({
      number: Canon.bookIdToNumber(id),
      selected: true
    }));
  }

  get booksOfferedForPartialTargetTraining(): string[] {
    return this.logicHandler.booksOfferedForPartialTargetTraining$.getValue();
  }

  onTargetTrainingBookSelect(books: number[]): void {
    const previousSelectedTargetIds = new Set(
      scriptureRangeToBookListWithoutChapterDetail(this.logicHandler.selectedTargetTrainingScriptureRange$.getValue())
    );
    const newSelectedIds = new Set(books.map(n => Canon.bookNumberToId(n)));
    const addedIds = [...newSelectedIds].filter(id => !previousSelectedTargetIds.has(id));

    this.logicHandler.selectTargetTrainingBooks([...newSelectedIds]);
    for (const bookId of this.targetTrainingChapterErrors.keys()) {
      if (!this.logicHandler.booksOfferedForPartialTargetTraining$.getValue().includes(bookId)) {
        this.targetTrainingChapterErrors.delete(bookId);
      }
    }

    // Auto-select newly added target books in each training source; drop removed books
    for (const source of this.trainingSources) {
      const available = this.logicHandler.availableTrainingSourceBooks$.getValue()[source.projectRef] ?? [];
      const currentSelected = this.logicHandler.selectedTrainingSourceBooks$.getValue()[source.projectRef] ?? [];
      const stillValid = currentSelected.filter(id => newSelectedIds.has(id));
      const autoAdded = addedIds.filter(id => available.includes(id));
      this.logicHandler.selectTrainingSourceBooks(source.projectRef, [...new Set([...stillValid, ...autoAdded])]);
    }
  }

  onTargetTrainingChaptersBlurred(bookId: string, value: string): void {
    let parsed: ChapterSet;
    try {
      parsed = new ChapterSet(value);
    } catch {
      this.targetTrainingChapterErrors.set(bookId, { key: 'chapter_input.invalid_range' });
      return;
    }

    const available = this.logicHandler.availableTargetTrainingScriptureRange$.getValue().books.get(bookId);
    const unavailable = available != null ? parsed.difference(available) : parsed;

    if (unavailable.count() > 0) {
      const drafted = this.logicHandler.selectedDraftingScriptureRange$.getValue().books.get(bookId);
      const draftedUnavailable = drafted != null ? unavailable.intersection(drafted) : new ChapterSet([]);
      if (draftedUnavailable.count() > 0) {
        this.targetTrainingChapterErrors.set(bookId, {
          key: 'chapter_input.chapters_will_be_translated',
          params: { chapters: draftedUnavailable.toString() }
        });
      } else {
        const targetName = this.activatedProjectService.projectDoc?.data?.shortName ?? '';
        this.targetTrainingChapterErrors.set(bookId, {
          key: 'chapter_input.chapters_not_in_target',
          params: { chapters: unavailable.toString(), targetName }
        });
      }
      return;
    }

    this.targetTrainingChapterErrors.delete(bookId);
    this.logicHandler.selectTargetTrainingChapters(bookId, value);
  }

  targetTrainingRangeForBook(bookId: string): string {
    const range = this.logicHandler.selectedTargetTrainingScriptureRange$.getValue();
    return range.books.get(bookId)?.toString() ?? '';
  }

  targetTrainingChapterHint(bookId: string): string {
    return this.logicHandler.availableTargetTrainingScriptureRange$.getValue().books.get(bookId)?.toString() ?? '';
  }

  // Section: Training source book selection

  get trainingSources(): DraftSource[] {
    return this.logicHandler.sources?.trainingSources ?? [];
  }

  onTrainingSourceBookSelect(books: number[], projectId: string): void {
    const bookIds = books.map(b => Canon.bookNumberToId(b));
    this.logicHandler.selectTrainingSourceBooks(projectId, bookIds);
  }

  availableTrainingSourceBooksForProject(projectId: string): Book[] {
    const bookIds = this.logicHandler.availableTrainingSourceBooks$.getValue()[projectId] ?? [];
    const selectedTargetIds = new Set(
      scriptureRangeToBookListWithoutChapterDetail(this.logicHandler.selectedTargetTrainingScriptureRange$.getValue())
    );
    const selectedIds = this.logicHandler.selectedTrainingSourceBooks$.getValue()[projectId] ?? [];
    return bookIds
      .filter(id => selectedTargetIds.has(id))
      .map(id => ({ number: Canon.bookIdToNumber(id), selected: selectedIds.includes(id) }));
  }

  selectedTrainingSourceBooksForProject(projectId: string): Book[] {
    const bookIds = this.logicHandler.selectedTrainingSourceBooks$.getValue()[projectId] ?? [];
    return bookIds.map(id => ({ number: Canon.bookIdToNumber(id), selected: true }));
  }
}
