import { DestroyRef, Injectable } from '@angular/core';
import { BehaviorSubject, firstValueFrom, map } from 'rxjs';
import { ActivatedProjectService } from '../../../../xforge-common/activated-project.service';
import { DraftSourcesAsArrays } from '../draft-source';
import { DraftSourcesService } from '../draft-sources.service';
import { ScriptureRange, ScriptureRangeBook } from './scripture-range';

@Injectable({ providedIn: 'root' })
class StubProgressServiceThatGivesChapterLevelInfo {
  getProgressForProject(_projectId: string): Promise<ScriptureRange> {
    return Promise.resolve(new ScriptureRange('GEN1-3,5;EXO2;LEV'));
  }
}

type NewDraftAbortMode = 'config_changed' | 'no_access' | null;

/**
 * Converts a ScriptureRange to a list of book IDs without including details about which chapters are in each book. This
 * is useful when the chapter-level detail is not needed, such as when determining which books users can select. If a
 * book is in the range but has no chapters, it is excluded from the list, since it shouldn't be offered for selection.
 */
function scriptureRangeToBookListWithoutChapterDetail(range: ScriptureRange): string[] {
  return range.books.filter(book => book.chapters == null || book.chapters.count() > 0).map(book => book.bookId);
}

/**
 * Implements business logic for creating a new draft. Intended to be used in conjunction with component that handles
 * UI interaction.
 */
export class NewDraftLogicHandler {
  status$ = new BehaviorSubject<'init' | 'input' | 'abort'>('init');
  abortMode$ = new BehaviorSubject<NewDraftAbortMode>(null);

  // A book can be present (in a project), available (logic rules do not forbit selecting it, and it is therefore
  // offered in the UI), and selected (user action, or default values selected the )
  availableDraftingScriptureRange$ = new BehaviorSubject<ScriptureRange | null>(null);
  availableDraftingBooks$ = this.availableDraftingScriptureRange$.pipe(
    map(range => (range ? scriptureRangeToBookListWithoutChapterDetail(range) : null))
  );
  selectedDraftingScriptureRange$ = new BehaviorSubject<ScriptureRange | null>(null);
  selectedDraftingBooks$ = this.selectedDraftingScriptureRange$.pipe(
    map(range => (range ? scriptureRangeToBookListWithoutChapterDetail(range) : []))
  );

  availableTargetTrainingScriptureRange$ = new BehaviorSubject<ScriptureRange | null>(null);
  availableTargetTrainingBooks$ = this.availableTargetTrainingScriptureRange$.pipe(
    map(range => (range ? scriptureRangeToBookListWithoutChapterDetail(range) : []))
  );
  selectedTargetTrainingScriptureRange$ = new BehaviorSubject<ScriptureRange | null>(null);
  selectedTargetTrainingBooks$ = this.selectedTargetTrainingScriptureRange$.pipe(
    map(range => (range ? scriptureRangeToBookListWithoutChapterDetail(range) : []))
  );

  availableSourceTrainingBooks$ = new BehaviorSubject<{ [key: string]: number[] }>({});
  /** The selected training books on the source side, by project ID (makes mixed source possible) */
  selectedSourceTrainingBooks$ = new BehaviorSubject<{ [key: string]: number[] }>({});

  /**
   * SPecifies what input mode the user is using. When a book is selected for use as drafting, it must be automatically
   * removed from being used as training. However, if a user selects and unselects a book while selecting books to
   * draft, that book shouldn't be automatically removed from being used as training data. Tracking the input state
   * allows update rules to be enforced at the right point in time.
   */
  private inputMode$ = new BehaviorSubject<'draft_books' | 'training_books'>('draft_books');

  /**
   * Whether the user has edited the training books. This impacts how the previously selected training books are
   * handled. If the last draft included a book as training data, it's automatically selected as training data for this
   * run. However, if the user selects it as a book to draft, it must be removed from the training data selection
   * automatically. If the user selects the book to draft, and then unselects the book, it should return to being auto
   * selected training book.
   */
  trainingBooksEdited: boolean = false;

  sources?: DraftSourcesAsArrays;

  constructor(
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly draftSourcesService: DraftSourcesService,
    private readonly progressService: StubProgressServiceThatGivesChapterLevelInfo,
    private readonly destroyRef: DestroyRef
  ) {
    void this.init();
  }

  /**
   * Sets up the state by loading the project, checking for changes in Paratext that haven't synced to SF yet, loading
   * progress data, and setting up subscripts that watch for changes that should result in bailing out (forcing the
   * user to restart the process). Automatically sets training books to most recently selected training books.
   */
  async init(): Promise<void> {
    if (this.activatedProjectService.projectId == null) throw new Error('No project selected');

    let progressReport: ScriptureRange;
    [progressReport, this.sources] = await Promise.all([
      this.progressService.getProgressForProject(this.activatedProjectService.projectId),
      // // TODO listen for more updates to figure out if we need to bail out and restart the process
      firstValueFrom(this.draftSourcesService.getDraftProjectSources())
    ]);

    const sourcesWithNoAccess = [
      ...this.sources.trainingSources,
      ...this.sources.trainingTargets,
      ...this.sources.draftingSources
    ].filter(source => source.noAccess);
    if (sourcesWithNoAccess.length > 0) {
      // TODO specify which projects cannot be accessed
      this.abort('no_access');
      return;
    }

    this.availableDraftingScriptureRange$.next(progressReport);
  }

  setInputMode(newMode: 'draft_books' | 'training_books'): void {
    const currentMode = this.inputMode$.getValue();
    if (currentMode === 'draft_books' && newMode === 'training_books') {
      this.limitAvailableTrainingBooksBasedOnSelectedDraftingBooks();
    }
    this.inputMode$.next(newMode);
  }

  selectDraftingBooks(books: string[]): void {
    if (this.inputMode$.getValue() !== 'draft_books') {
      throw new Error('Cannot update draft books when not in draft_books input mode');
    }
    const newBooksScriptureRange = new ScriptureRange(books.map(bookId => new ScriptureRangeBook(bookId)));
    const newDraftingScriptureRange = newBooksScriptureRange.intersection(
      this.availableDraftingScriptureRange$.getValue()!
    );
    this.selectedDraftingScriptureRange$.next(newDraftingScriptureRange);
  }

  selectTargetTrainingBooks(books: string[]): void {
    if (this.inputMode$.getValue() !== 'training_books') {
      throw new Error('Cannot update training books when not in training_books input mode');
    }
    const newBooksScriptureRange = new ScriptureRange(books.map(bookId => new ScriptureRangeBook(bookId)));
    const newTargetTrainingScriptureRange = newBooksScriptureRange.intersection(
      this.availableTargetTrainingScriptureRange$.getValue()!
    );
    this.selectedTargetTrainingScriptureRange$.next(newTargetTrainingScriptureRange);
  }

  private abort(mode: NewDraftAbortMode): void {
    this.abortMode$.next(mode);
    this.status$.next('abort');
  }

  private limitAvailableTrainingBooksBasedOnSelectedDraftingBooks(): void {}
}
