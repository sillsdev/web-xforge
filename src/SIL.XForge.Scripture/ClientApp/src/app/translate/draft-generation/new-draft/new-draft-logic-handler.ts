import { Injectable } from '@angular/core';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { ActivatedProjectService } from '../../../../xforge-common/activated-project.service';
import { filterNullish } from '../../../../xforge-common/util/rxjs-util';
import { ProgressService } from '../../../shared/progress-service/progress.service';
import { DraftSourcesAsArrays } from '../draft-source';
import { DraftSourcesService } from '../draft-sources.service';
import { ChapterSet, VerboseScriptureRange } from './scripture-range';

@Injectable({ providedIn: 'root' })
// FIXME change class name
export class ProgressServiceThatGivesChapterLevelInfo {
  constructor(private readonly progressService: ProgressService) {}

  async getProgressForProject(projectId: string): Promise<VerboseScriptureRange> {
    const progress = await this.progressService.getProgressWithChapterProgress(projectId, {
      maxStalenessMs: 1000 * 60
    });
    const scriptureRange = new VerboseScriptureRange('');
    for (const bookProgress of progress.books) {
      // Add the book to the scripture range
      scriptureRange.books.set(bookProgress.bookId, new ChapterSet([]));
      for (const chapterProgress of bookProgress.chapters) {
        const nonBlankSegments = chapterProgress.verseSegments - chapterProgress.blankVerseSegments;
        const completionRatio =
          chapterProgress.verseSegments === 0 ? 0 : nonBlankSegments / chapterProgress.verseSegments;
        if (completionRatio > 0.1) {
          scriptureRange.books.get(bookProgress.bookId)?.chapters.add(chapterProgress.chapterNumber);
        }
      }
    }
    // Remove empty books from the scripture ranges, since they shouldn't be offered for selection
    for (const [bookId, chapterSet] of scriptureRange.books) {
      if (chapterSet.chapters.size === 0) {
        scriptureRange.books.delete(bookId);
      }
    }
    return scriptureRange;
  }
}

type NewDraftAbortMode = 'config_changed' | 'no_access' | null;

/**
 * Converts a ScriptureRange to a list of book IDs without including details about which chapters are in each book. This
 * is useful when the chapter-level detail is not needed, such as when determining which books users can select. If a
 * book is in the range but has no chapters, it is excluded from the list, since it shouldn't be offered for selection.
 */
export function scriptureRangeToBookListWithoutChapterDetail(range: VerboseScriptureRange): string[] {
  return Array.from(range.books.keys());
}

function mapObject<T, U>(obj: { [key: string]: T }, mapFn: (key: string, value: T) => U): { [key: string]: U } {
  return Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, mapFn(key, value)]));
}

/**
 * Implements business logic for creating a new draft. Intended to be used in conjunction with a component that handles
 * UI interaction.
 *
 * Basic flow is:
 * 1. Initilization: Loads project and progress data, determines which books and chapters are available for drafting and
 * training, and sets up subscriptions to watch background changes that would necessitate forcing the user to start
 * over. The draft source and target projects are tracked at a chapter level, while the training sources are only
 * tracked at a book level.
 *
 */
export class NewDraftLogicHandler {
  status$ = new BehaviorSubject<'init' | 'input' | 'abort'>('init');
  abortMode$ = new BehaviorSubject<NewDraftAbortMode>(null);

  // A book can be present (in a project), available (logic rules do not forbit selecting it, and it is therefore
  // offered in the UI), and selected (user action, or default values selected the )
  availableDraftingScriptureRange$ = new BehaviorSubject<VerboseScriptureRange>(new VerboseScriptureRange(''));
  selectedDraftingScriptureRange$ = new BehaviorSubject<VerboseScriptureRange>(new VerboseScriptureRange(''));

  targetProjectScriptureRange = new VerboseScriptureRange('');
  availableTargetTrainingScriptureRange$ = new BehaviorSubject<VerboseScriptureRange>(new VerboseScriptureRange(''));
  selectedTargetTrainingScriptureRange$ = new BehaviorSubject<VerboseScriptureRange>(new VerboseScriptureRange(''));

  /** Books that exist in the training sources, by project ID */
  trainingSourceBooks$ = new BehaviorSubject<{ [projectId: string]: string[] }>({});
  availableTrainingSourceBooks$ = new BehaviorSubject<{ [projectId: string]: string[] }>({});
  selectedTrainingSourceBooks$ = new BehaviorSubject<{ [projectId: string]: string[] }>({});

  booksOfferedForPartialDrafting$ = new BehaviorSubject<string[]>([]);
  booksOfferedForPartialTargetTraining$ = new BehaviorSubject<string[]>([]);

  /**
   * SPecifies what input mode the user is using. When a book is selected for use as drafting, it must be automatically
   * removed from being used as training. However, if a user selects and unselects a book while selecting books to
   * draft, that book shouldn't be automatically removed from being used as training data. Tracking the input state
   * allows update rules to be enforced at the right point in time.
   */
  inputMode$ = new BehaviorSubject<'draft_books' | 'training_books'>('draft_books');

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
    private readonly progressService: ProgressServiceThatGivesChapterLevelInfo
    // private readonly _destroyRef: DestroyRef
  ) {
    void this.init();
  }

  /**
   * Sets up the state by loading the project, checking for changes in Paratext that haven't synced to SF yet, loading
   * progress data, and setting up subscripts that watch for changes that should result in bailing out (forcing the
   * user to restart the process). Automatically sets training books to most recently selected training books.
   */
  async init(): Promise<void> {
    const projectId = await firstValueFrom(this.activatedProjectService.projectId$.pipe(filterNullish()));
    const projectDoc = await firstValueFrom(this.activatedProjectService.projectDoc$.pipe(filterNullish()));

    if (projectId == null) throw new Error('No project selected');
    if (projectDoc?.data == null) throw new Error('Project data not loaded');

    const draftConfig = projectDoc?.data?.translateConfig?.draftConfig;

    if (draftConfig == null) throw new Error('Draft config not found in project data');

    if (draftConfig.draftingSources.length !== 1) {
      throw new Error(`Expected exactly one drafting source; found ${draftConfig.draftingSources.length}`);
    }
    const draftingSource = draftConfig.draftingSources[0];

    let draftSourceProgress: VerboseScriptureRange;
    let targetProjectProgress: VerboseScriptureRange;
    let trainingSourcesProgress: { projectId: string; range: VerboseScriptureRange }[];
    // Create a promise for loading the progress for all training sources, so that it can be done in parallel with
    // loading the progress for the drafting source and target project
    const trainingSourcesProgressPromise = Promise.all(
      draftConfig.trainingSources.map(async trainingSource => {
        const progress = await this.progressService.getProgressForProject(trainingSource.projectRef);
        return { projectId: trainingSource.projectRef, range: progress };
      })
    );

    [draftSourceProgress, targetProjectProgress, trainingSourcesProgress, this.sources] = await Promise.all([
      this.progressService.getProgressForProject(draftingSource.projectRef),
      this.progressService.getProgressForProject(projectId),
      trainingSourcesProgressPromise,
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

    this.targetProjectScriptureRange = targetProjectProgress;
    this.availableDraftingScriptureRange$.next(draftSourceProgress);
    this.availableTargetTrainingScriptureRange$.next(targetProjectProgress);
    this.trainingSourceBooks$.next(
      Object.fromEntries(
        trainingSourcesProgress.map(source => [
          source.projectId,
          scriptureRangeToBookListWithoutChapterDetail(source.range)
        ])
      )
    );

    this.status$.next('input');
  }

  hasVisitedTrainingBooksInputMode = false;
  setInputMode(newMode: 'draft_books' | 'training_books'): void {
    const currentMode = this.inputMode$.getValue();
    if (currentMode === 'draft_books' && newMode === 'training_books') {
      if (!this.hasVisitedTrainingBooksInputMode) {
        this.loadPreviouslySelectedTrainingBooks();
        this.hasVisitedTrainingBooksInputMode = true;
      }
      this.limitAvailableTrainingRangeBasedOnSelectedDraftingRange();
    }
    this.inputMode$.next(newMode);
  }

  selectDraftingBooks(books: string[]): void {
    if (this.inputMode$.getValue() !== 'draft_books') {
      throw new Error('Cannot update draft books when not in draft_books input mode');
    }

    const newDraftingScriptureRange = new VerboseScriptureRange('');
    const newlySelectedBooks = books.filter(book => !this.selectedDraftingScriptureRange$.getValue().books.has(book));

    for (const book of books) {
      if (!this.availableDraftingScriptureRange$.getValue().books.has(book)) {
        throw new Error(`Selected book ${book} not in available drafting scripture range`);
      }
      if (newlySelectedBooks.includes(book)) {
        // Default to selecting chapters that are in the source but not the target, unless that's zero chapters, in
        // which case default to selecting all chapters in the source
        const chaptersInTarget = this.targetProjectScriptureRange.books.get(book);
        const chaptersInSource = this.availableDraftingScriptureRange$.getValue().books.get(book);
        if (chaptersInSource == null)
          throw new Error(`Selected book ${book} not in available drafting scripture range`);
        if (chaptersInTarget == null) {
          newDraftingScriptureRange.books.set(book, chaptersInSource);
        } else {
          const newChaptersToDraft = chaptersInSource.difference(chaptersInTarget);
          if (newChaptersToDraft.count() > 0) newDraftingScriptureRange.books.set(book, newChaptersToDraft);
          else newDraftingScriptureRange.books.set(book, chaptersInSource);
        }
      } else {
        const alreadySelectedChapters = this.selectedDraftingScriptureRange$.getValue().books.get(book);
        if (alreadySelectedChapters == null) throw new Error('This should be unreachable');
        newDraftingScriptureRange.books.set(book, alreadySelectedChapters);
      }
    }
    this.selectedDraftingScriptureRange$.next(newDraftingScriptureRange);

    const partialBookDraftingBooks = books.filter(bookId => this.isBookEligibleForPartialDrafting(bookId));
    this.booksOfferedForPartialDrafting$.next(partialBookDraftingBooks);
  }

  trySelectDraftingChapters(bookId: string, chapters: string): true | string {
    if (this.inputMode$.getValue() !== 'draft_books') {
      throw new Error('Cannot update draft books when not in draft_books input mode');
    }

    let selectedChapters: ChapterSet;
    try {
      selectedChapters = new ChapterSet(chapters);
    } catch (e) {
      return `Invalid chapter range: ${e instanceof Error ? e.message : String(e)}`;
    }

    if (this.booksOfferedForPartialDrafting$.getValue().includes(bookId) !== true) {
      return `Book ${bookId} is not eligible for partial drafting`;
    }
    // Chapters need to exist in the source to be a valid selection
    const chaptersInSource = this.availableDraftingScriptureRange$.getValue().books.get(bookId);
    if (chaptersInSource == null) throw new Error(`Book ${bookId} not in available drafting scripture range`);
    const selectedChaptersNotInSource = selectedChapters.difference(chaptersInSource);
    if (selectedChaptersNotInSource.count() > 0) {
      return `Selected chapters ${selectedChaptersNotInSource.toString()} are not in the available drafting scripture range for book ${bookId}`;
    }

    const currentRange = this.selectedDraftingScriptureRange$.getValue();
    const newDraftingScriptureRange = new VerboseScriptureRange(currentRange.toString());
    newDraftingScriptureRange.books.set(bookId, selectedChapters);
    this.selectedDraftingScriptureRange$.next(newDraftingScriptureRange);
    return true;
  }

  private isBookEligibleForPartialDrafting(bookId: string): boolean {
    const sourceChapterCount = this.availableDraftingScriptureRange$.getValue().books.get(bookId)?.chapters.size;
    const targetChaptersWithContent = this.targetProjectScriptureRange.books.get(bookId)?.chapters.size;

    return (
      sourceChapterCount != null &&
      sourceChapterCount >= 12 &&
      targetChaptersWithContent != null &&
      targetChaptersWithContent >= 1
    );
  }

  selectTargetTrainingBooks(books: string[]): void {
    if (this.inputMode$.getValue() !== 'training_books') {
      throw new Error('Cannot update training books when not in training_books input mode');
    }
    const newTargetTrainingScriptureRange = new VerboseScriptureRange('');
    for (const bookId of books) {
      const bookRange = this.availableTargetTrainingScriptureRange$.getValue().books.get(bookId);
      if (bookRange) {
        newTargetTrainingScriptureRange.books.set(bookId, bookRange);
      }
    }
    this.selectedTargetTrainingScriptureRange$.next(newTargetTrainingScriptureRange);

    const partialBookTargetTrainingBooks = books.filter(bookId => this.isBookEligibleForPartialTargetTraining(bookId));
    this.booksOfferedForPartialTargetTraining$.next(partialBookTargetTrainingBooks);
  }

  private isBookEligibleForPartialTargetTraining(bookId: string): boolean {
    // Books should be available for partial training if selected on the prior step, if and only if the book has
    // chapters that could be used for training data that weren't selected for drafting in the prior step.

    if (!this.booksOfferedForPartialDrafting$.getValue().includes(bookId)) return false;

    const chaptersSelectedForDrafting = this.selectedDraftingScriptureRange$.getValue().books.get(bookId);
    const chaptersAvailableForTraining = this.availableTargetTrainingScriptureRange$.getValue().books.get(bookId);

    if (chaptersSelectedForDrafting == null || chaptersAvailableForTraining == null) return false;

    const chaptersThatCouldBeUsedForTraining = chaptersAvailableForTraining.difference(chaptersSelectedForDrafting);
    return chaptersThatCouldBeUsedForTraining.count() >= 1;
  }

  private abort(mode: NewDraftAbortMode): void {
    this.abortMode$.next(mode);
    this.status$.next('abort');
  }

  private loadPreviouslySelectedTrainingBooks(): void {
    const draftConfig = this.activatedProjectService.projectDoc?.data?.translateConfig?.draftConfig;
    if (draftConfig == null) throw new Error('Draft config not found in project data');
    const selectedTrainingSourceBooksByProjectId: { [key: string]: string[] } = {};
    const availableTrainingSourceBooksByProjectId: { [key: string]: string[] } = {};
    for (const sourceScriptureRange of draftConfig.lastSelectedTrainingScriptureRanges ?? []) {
      const previouslySelectedBooks = (selectedTrainingSourceBooksByProjectId[sourceScriptureRange.projectId] =
        Array.from(new VerboseScriptureRange(sourceScriptureRange.scriptureRange).books.keys()));
      const booksCurrentlyPresentInProject = this.trainingSourceBooks$.getValue()[sourceScriptureRange.projectId] ?? [];
      availableTrainingSourceBooksByProjectId[sourceScriptureRange.projectId] = booksCurrentlyPresentInProject;
      selectedTrainingSourceBooksByProjectId[sourceScriptureRange.projectId] = previouslySelectedBooks.filter(bookId =>
        booksCurrentlyPresentInProject.includes(bookId)
      );
    }
    this.availableTrainingSourceBooks$.next(availableTrainingSourceBooksByProjectId);
    this.selectedTrainingSourceBooks$.next(selectedTrainingSourceBooksByProjectId);

    // Combine the previously selected source training scripture ranges to estimate the previously selected target
    // training scripture range. This isn't correct behavior (TODO fix), but is the current behavior, and we aren't
    // storing the information we need to do it correctly.
    const allPreviouslySelectedBooks = new Set(
      Object.values(selectedTrainingSourceBooksByProjectId).reduce((acc, books) => acc.concat(books), [])
    );
    const availableTargetTrainingScriptureRange = this.availableTargetTrainingScriptureRange$.getValue();
    if (availableTargetTrainingScriptureRange == null) {
      throw new Error('Available target training scripture range not loaded');
    }
    const targetTrainingScriptureRange = new VerboseScriptureRange('');
    for (const bookId of allPreviouslySelectedBooks) {
      const bookRange = availableTargetTrainingScriptureRange.books.get(bookId);
      if (bookRange) {
        targetTrainingScriptureRange.books.set(bookId, bookRange);
      }
    }

    this.selectedTargetTrainingScriptureRange$.next(targetTrainingScriptureRange);
  }

  private limitAvailableTrainingRangeBasedOnSelectedDraftingRange(): void {
    // Limit available and selected target training scripture range to not overlap selected drafting range
    this.availableTargetTrainingScriptureRange$.next(
      this.targetProjectScriptureRange.difference(this.selectedDraftingScriptureRange$.getValue())
    );
    this.selectedTargetTrainingScriptureRange$.next(
      this.selectedTargetTrainingScriptureRange$.getValue().difference(this.selectedDraftingScriptureRange$.getValue())
    );

    // Limit available and selected training source books to not exceed available target training scripture range
    const availableTargetRange = this.availableTargetTrainingScriptureRange$.getValue();
    this.availableTrainingSourceBooks$.next(
      mapObject(this.trainingSourceBooks$.getValue(), (_projectId, bookIds) =>
        bookIds.filter(bookId => availableTargetRange.books.has(bookId))
      )
    );
    this.selectedTrainingSourceBooks$.next(
      mapObject(this.selectedTrainingSourceBooks$.getValue(), (projectId, bookIds) =>
        bookIds.filter(bookId => this.availableTrainingSourceBooks$.getValue()[projectId]?.includes(bookId))
      )
    );
  }
}
