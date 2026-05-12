import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { BehaviorSubject } from 'rxjs';
import { ActivatedProjectService } from '../../../../xforge-common/activated-project.service';
import { SFProjectService } from '../../../core/sf-project.service';
import { DraftSource } from '../draft-source';

// 1:54
class ScriptureRangeBook {
  constructor(readonly bookId: string) {}
  chapters?: Set<number>;
  toString(): string {
    return this.bookId + (this.chapters == null ? '' : [...this.chapters].join(','));
  }
}

class ScriptureRange {
  books: ScriptureRangeBook[] = [];
  constructor(private range?: string) {
    if (range != null) {
      const books = range?.split(';');
      const bookId = range.slice(0, 3);
      const chapterRange = range.slice(3);
    }
  }

  toString(): string {
    return this.books.map(book => book.toString()).join(';');
  }
}

/**
 * Implements business logic for creating a new draft. Intended to be used in conjunction with component that handles
 * UI interaction.
 */
export class NewDraftLogicHandler {
  status$: BehaviorSubject<'init' | 'input' | 'abort'> = new BehaviorSubject('init');

  // A book can be present (in a project), available (logic rules do not forbit selecting it, and it is therefore
  // offered in the UI), and selected (user action, or default values selected the )

  availableDraftingBooks$: BehaviorSubject<number[]> = new BehaviorSubject([]);
  selectedDraftingBooks$: BehaviorSubject<number[]> = new BehaviorSubject([]);

  availableTargetTrainingBooks$: BehaviorSubject<number[]> = new BehaviorSubject([]);
  selectedTargetTrainingBooks$: BehaviorSubject<number[]> = new BehaviorSubject([]);

  availableSourceTrainingBooks$: BehaviorSubject<{ [key: string]: number[] }> = new BehaviorSubject([]);
  /** The selected training books on the source side, by project ID (makes mixed source possible) */
  selectedSourceTrainingBooks$: BehaviorSubject<{ [key: string]: number[] }> = new BehaviorSubject([]);

  /**
   * SPecifies what input mode the user is using. When a book is selected for use as drafting, it must be automatically
   * removed from being used as training. However, if a user selects and unselects a book while selecting books to
   * draft, that book shouldn't be automatically removed from being used as training data. Tracking the input state
   * allows update rules to be enforced at the right point in time.
   */
  private inputMode$: BehaviorSubject<'draft_books' | 'training_books'> = new BehaviorSubject('draft_books');

  /**
   * Whether the user has edited the training books. This impacts how the previously selected training books are
   * handled. If the last draft included a book as training data, it's automatically selected as training data for this
   * run. However, if the user selects it as a book to draft, it must be removed from the training data selection
   * automatically. If the user selects the book to draft, and then unselects the book, it should return to being auto
   * selected training book.
   */
  trainingBooksEdited: boolean = false;

  sources: {
    trainingSources: DraftSource[];
    trainingTarget: SFProjectProfile;
    draftingSourc: DraftSource;
  } = {};

  constructor(
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly projectService: SFProjectService
  ) {
    void this.init();
  }

  /**
   * Sets up the state by loading the project, checking for changes in Paratext that haven't synced to SF yet, loading
   * progress data, and setting up subscripts that watch for changes that should result in bailing out (forcing the
   * user to restart the process). Automatically sets training books to most recently selected training books.
   */
  async init(): Promise<void> {
    // ensure projects do not have changes on Paratext that haven't synced yet
    // load progress data
    //
  }

  setInputMode(newMode: 'draft_books' | 'training_books'): void {
    const currentMode = this.inputMode$.getValue();
    if (currentMode === 'draft_books' && newMode === 'training_books') {
      this.limitAvailableTrainingBooksBasedOnSelectedDraftingBooks();
    }
    this.inputMode$.setValue(newMode);
  }

  selectDraftingBooks(books: number[]) {
    if (this.inputMode$.getValue() !== 'draft_books') {
      throw new Error('Cannot update draft books when not in draft_books input mode');
    }
    this.selectedDraftingBooks$.next(books);
  }

  selectTargetTrainingBooks(books: number[]) {
    if (this.inputMode$.getValue() !== 'training_books') {
      throw new Error('Cannot update training books when not in training_books input mode');
    }
    this.selectedTargetTrainingBooks$.next(books);
  }

  private limitAvailableTrainingBooksBasedOnSelectedDraftingBooks(): void {
    const targetBooks;
  }
}
