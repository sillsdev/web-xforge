import { DestroyRef, Injectable } from '@angular/core';
import { Canon } from '@sillsdev/scripture';
import { isEqual } from 'lodash-es';
import { BehaviorSubject, firstValueFrom, skip } from 'rxjs';
import { ActivatedProjectService } from '../../../../xforge-common/activated-project.service';
import { filterNullish, quietTakeUntilDestroyed } from '../../../../xforge-common/util/rxjs-util';
import { ProgressService } from '../../../shared/progress-service/progress.service';
import { DraftSourcesAsArrays } from '../draft-source';
import { DraftSourcesService } from '../draft-sources.service';
import { ChapterSet, VerboseScriptureRange } from './scripture-range';

/**
 * Minimum number of chapters a source book must have before it is offered for partial (chapter-level) drafting.
 * Books smaller than this are only ever drafted in full.
 */
const MIN_SOURCE_CHAPTERS_FOR_PARTIAL_DRAFTING = 12;

/**
 * When false (current behavior, matching the legacy stepper), a book is only offered for drafting if it also exists in
 * the target project's text list. This is a temporary restriction: the current UI doesn't handle drafting a book that
 * isn't already in the target. SF-3822 is intended to lift this soon, at which point this can be changed to true and
 * any canonical book with source content is offered regardless of target membership.
 *
 * Overridable on the class (NewDraftLogicHandler.allowDraftingBooksNotInTarget) so tests can exercise both branches.
 */
export const ALLOW_DRAFTING_BOOKS_NOT_IN_TARGET = false;

/**
 * Why a book that a user might expect to see was left out of the list offered for drafting. Every excluded book is
 * recorded with its reason so the UI can explain the omission. Not every reason is surfaced to the user: 'non_canonical'
 * books (front/back matter, glossaries, etc.) are excluded silently, since users don't expect them to be draftable.
 */
export type DraftingBookExclusionReason = 'non_canonical' | 'no_source_content' | 'not_in_target';

export interface ExcludedDraftingBook {
  bookId: string;
  reason: DraftingBookExclusionReason;
}

@Injectable({ providedIn: 'root' })
/** Like ProgressService, but provides a VerboseScriptureRange instead of raw progress data */
export class DraftProgressService {
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

export type NewDraftAbortMode = 'config_changed' | 'no_access' | 'init_failure' | null;

/**
 * Returns the book IDs in a ScriptureRange, dropping the chapter-level detail. Useful when only the set of books
 * matters, such as determining which books users can select. Books with no chapters are already pruned when ranges are
 * built (see getProgressForProject and VerboseScriptureRange.removeEmptyBooks), so every returned book is selectable.
 */
export function scriptureRangeToBookListWithoutChapterDetail(range: VerboseScriptureRange): string[] {
  return Array.from(range.books.keys());
}

function mapObject<T, U>(obj: { [key: string]: T }, mapFn: (key: string, value: T) => U): { [key: string]: U } {
  return Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, mapFn(key, value)]));
}

/**
 * Returns a copy of the range with extra-material (non-canonical) books removed. Such books (front/back matter,
 * glossaries, etc.) are never drafted or used as training data, so they should not be offered for selection.
 */
function withoutExtraMaterialBooks(range: VerboseScriptureRange): VerboseScriptureRange {
  const result = range.clone();
  for (const bookId of result.books.keys()) {
    if (Canon.isExtraMaterial(bookId)) {
      result.books.delete(bookId);
    }
  }
  return result;
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
  /** See ALLOW_DRAFTING_BOOKS_NOT_IN_TARGET. Exposed as a static so tests can exercise both branches. */
  static allowDraftingBooksNotInTarget = ALLOW_DRAFTING_BOOKS_NOT_IN_TARGET;

  status$ = new BehaviorSubject<'init' | 'input' | 'abort'>('init');
  abortMode$ = new BehaviorSubject<NewDraftAbortMode>(null);

  /** Names of the projects that could not be accessed, populated when aborting with mode 'no_access'. */
  inaccessibleProjectNames: string[] = [];
  /** The error that caused an 'init_failure' abort, retained so the component can report it. */
  initError?: unknown;

  // A book can be present (in a project), available (logic rules do not forbit selecting it, and it is therefore
  // offered in the UI), and selected (user action, or default values selected the )
  availableDraftingScriptureRange$ = new BehaviorSubject<VerboseScriptureRange>(new VerboseScriptureRange(''));
  selectedDraftingScriptureRange$ = new BehaviorSubject<VerboseScriptureRange>(new VerboseScriptureRange(''));

  /** Books left out of the drafting list, with the reason for each (see DraftingBookExclusionReason). */
  excludedDraftingBooks$ = new BehaviorSubject<ExcludedDraftingBook[]>([]);

  targetProjectScriptureRange = new VerboseScriptureRange('');
  availableTargetTrainingScriptureRange$ = new BehaviorSubject<VerboseScriptureRange>(new VerboseScriptureRange(''));
  selectedTargetTrainingScriptureRange$ = new BehaviorSubject<VerboseScriptureRange>(new VerboseScriptureRange(''));

  /**
   * Target books that have content available for training but are not offered, because no training source contains
   * the book (so it could never be paired with a source). Populated when the training step is entered; used to explain
   * why those books are missing from the target training list.
   */
  targetTrainingBooksWithoutSource$ = new BehaviorSubject<string[]>([]);

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

  sources?: DraftSourcesAsArrays;

  constructor(
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly draftSourcesService: DraftSourcesService,
    private readonly progressService: DraftProgressService,
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
    try {
      const projectId = await firstValueFrom(this.activatedProjectService.projectId$.pipe(filterNullish()));
      const projectDoc = await firstValueFrom(this.activatedProjectService.projectDoc$.pipe(filterNullish()));

      if (projectId == null) throw new Error('No project selected');
      if (projectDoc?.data == null) throw new Error('Project data not loaded');

      const draftConfig = projectDoc?.data?.translateConfig?.draftConfig;

      if (draftConfig == null) throw new Error('Draft config not found in project data');

      // The UI never allows configuring more than one drafting source, so this is treated as an impossible state.
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
        firstValueFrom(this.draftSourcesService.getDraftProjectSources())
      ]);

      const sourcesWithNoAccess = [
        ...this.sources.trainingSources,
        ...this.sources.trainingTargets,
        ...this.sources.draftingSources
      ].filter(source => source.noAccess);
      if (sourcesWithNoAccess.length > 0) {
        this.inaccessibleProjectNames = sourcesWithNoAccess
          .map(source => source.name ?? source.shortName ?? '')
          .filter(name => name !== '');
        this.abort('no_access');
        return;
      }

      const targetTextBookIds = new Set((projectDoc.data.texts ?? []).map(text => Canon.bookNumberToId(text.bookNum)));
      const { available, excluded } = this.computeOfferedDraftingBooks(draftSourceProgress, targetTextBookIds);

      // Extra-material (non-canonical) books are never offered for training. (The drafting list handles them
      // separately via computeOfferedDraftingBooks.)
      const canonicalTargetProgress = withoutExtraMaterialBooks(targetProjectProgress);

      this.targetProjectScriptureRange = canonicalTargetProgress;
      this.availableDraftingScriptureRange$.next(available);
      this.excludedDraftingBooks$.next(excluded);
      this.availableTargetTrainingScriptureRange$.next(canonicalTargetProgress);
      this.trainingSourceBooks$.next(
        Object.fromEntries(
          trainingSourcesProgress.map(source => [
            source.projectId,
            scriptureRangeToBookListWithoutChapterDetail(withoutExtraMaterialBooks(source.range))
          ])
        )
      );

      this.status$.next('input');

      // Watch for mid-flow config changes. Skip the initial emission (already consumed above) and abort if the
      // sources change, matching the behavior of the legacy draft-generation-steps component.
      this.draftSourcesService
        .getDraftProjectSources()
        .pipe(skip(1), quietTakeUntilDestroyed(this.destroyRef))
        .subscribe(newSources => {
          if (!isEqual(this.sources, newSources)) {
            this.abort('config_changed');
          }
        });
    } catch (error) {
      // Any unanticipated failure while loading project/progress data (network errors, missing config, etc.) aborts
      // into a generic failure state rather than leaving the wizard stuck on its loading spinner. The error is
      // retained so the component can route it to the global error handler.
      this.initError = error;
      this.abort('init_failure');
    }
  }

  private hasVisitedTrainingBooksInputMode = false;
  setInputMode(newMode: 'draft_books' | 'training_books'): void {
    const priorMode = this.inputMode$.getValue();
    // Switch the mode first so that loadPreviouslySelectedTrainingBooks() can use the normal training-book selection
    // path (e.g. selectTargetTrainingBooks), which requires being in training_books mode.
    this.inputMode$.next(newMode);
    if (priorMode === 'draft_books' && newMode === 'training_books') {
      this.limitAvailableTrainingRangeBasedOnSelectedDraftingRange();
      if (!this.hasVisitedTrainingBooksInputMode) {
        this.loadPreviouslySelectedTrainingBooks();
        this.hasVisitedTrainingBooksInputMode = true;
      }
    }
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
          newDraftingScriptureRange.books.set(book, chaptersInSource.clone());
        } else {
          const newChaptersToDraft = chaptersInSource.difference(chaptersInTarget);
          if (newChaptersToDraft.count() > 0) newDraftingScriptureRange.books.set(book, newChaptersToDraft);
          else newDraftingScriptureRange.books.set(book, chaptersInSource.clone());
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

  selectDraftingChapters(bookId: string, chapters: string): void {
    if (this.inputMode$.getValue() !== 'draft_books') {
      throw new Error('Cannot update draft books when not in draft_books input mode');
    }

    const selectedChapters = new ChapterSet(chapters);

    if (!this.booksOfferedForPartialDrafting$.getValue().includes(bookId)) {
      throw new Error(`Book ${bookId} is not eligible for partial drafting`);
    }
    const chaptersInSource = this.availableDraftingScriptureRange$.getValue().books.get(bookId);
    if (chaptersInSource == null) throw new Error(`Book ${bookId} not in available drafting scripture range`);
    const selectedChaptersNotInSource = selectedChapters.difference(chaptersInSource);
    if (selectedChaptersNotInSource.count() > 0) {
      throw new Error(
        `Selected chapters ${selectedChaptersNotInSource.toString()} are not in the available drafting scripture range for book ${bookId}`
      );
    }

    const newDraftingScriptureRange = this.selectedDraftingScriptureRange$.getValue().clone();
    newDraftingScriptureRange.books.set(bookId, selectedChapters);
    this.selectedDraftingScriptureRange$.next(newDraftingScriptureRange);
  }

  /**
   * Determines which books from the drafting source are offered for drafting, and records why each book the user might
   * expect to see was left out. A book is offered only if it is canonical, has content in the drafting source, and
   * (unless allowDraftingBooksNotInTarget is set) exists in the target project's text list.
   *
   * The books considered are those with content in the drafting source plus those present in the target project. This
   * lets the UI explain both books the target contains but the source has no text for ('no_source_content') and books
   * the source has but the target lacks ('not_in_target'). Books that are excluded purely for being non-canonical are
   * recorded as 'non_canonical' but are not surfaced to the user.
   */
  private computeOfferedDraftingBooks(
    draftSourceProgress: VerboseScriptureRange,
    targetTextBookIds: Set<string>
  ): { available: VerboseScriptureRange; excluded: ExcludedDraftingBook[] } {
    const available = new VerboseScriptureRange('');
    const excluded: ExcludedDraftingBook[] = [];

    const booksToConsider = new Set<string>([...draftSourceProgress.books.keys(), ...targetTextBookIds]);
    // Evaluate in canonical order so the excluded list (and any notice built from it) reads naturally.
    const orderedBooks = Array.from(booksToConsider).sort((a, b) => Canon.bookIdToNumber(a) - Canon.bookIdToNumber(b));

    for (const bookId of orderedBooks) {
      if (Canon.isExtraMaterial(bookId)) {
        excluded.push({ bookId, reason: 'non_canonical' });
      } else if (!draftSourceProgress.books.has(bookId)) {
        excluded.push({ bookId, reason: 'no_source_content' });
      } else if (!NewDraftLogicHandler.allowDraftingBooksNotInTarget && !targetTextBookIds.has(bookId)) {
        excluded.push({ bookId, reason: 'not_in_target' });
      } else {
        available.books.set(bookId, draftSourceProgress.books.get(bookId)!.clone());
      }
    }

    return { available, excluded };
  }

  private isBookEligibleForPartialDrafting(bookId: string): boolean {
    const sourceChapterCount = this.availableDraftingScriptureRange$.getValue().books.get(bookId)?.count();
    const targetChaptersWithContent = this.targetProjectScriptureRange.books.get(bookId)?.count();

    return (
      sourceChapterCount != null &&
      sourceChapterCount >= MIN_SOURCE_CHAPTERS_FOR_PARTIAL_DRAFTING &&
      targetChaptersWithContent != null &&
      targetChaptersWithContent >= 1
    );
  }

  selectTargetTrainingChapters(bookId: string, chapters: string): void {
    if (this.inputMode$.getValue() !== 'training_books') {
      throw new Error('Cannot update training chapters when not in training_books input mode');
    }

    const selectedChapters = new ChapterSet(chapters);

    if (!this.booksOfferedForPartialTargetTraining$.getValue().includes(bookId)) {
      throw new Error(`Book ${bookId} is not eligible for partial target training`);
    }
    const chaptersAvailableForTraining = this.availableTargetTrainingScriptureRange$.getValue().books.get(bookId);
    if (chaptersAvailableForTraining == null)
      throw new Error(`Book ${bookId} not in available target training scripture range`);
    const selectedChaptersNotAvailable = selectedChapters.difference(chaptersAvailableForTraining);
    if (selectedChaptersNotAvailable.count() > 0) {
      throw new Error(
        `Selected chapters ${selectedChaptersNotAvailable.toString()} are not available for target training for book ${bookId}`
      );
    }

    const newTargetTrainingScriptureRange = this.selectedTargetTrainingScriptureRange$.getValue().clone();
    newTargetTrainingScriptureRange.books.set(bookId, selectedChapters);
    this.selectedTargetTrainingScriptureRange$.next(newTargetTrainingScriptureRange);
  }

  selectTrainingSourceBooks(projectId: string, bookIds: string[]): void {
    if (this.inputMode$.getValue() !== 'training_books') {
      throw new Error('Cannot update training source books when not in training_books input mode');
    }
    const available = this.availableTrainingSourceBooks$.getValue()[projectId] ?? [];
    for (const bookId of bookIds) {
      if (!available.includes(bookId)) {
        throw new Error(`Selected book ${bookId} is not available for training source project ${projectId}`);
      }
    }
    const current = { ...this.selectedTrainingSourceBooks$.getValue() };
    current[projectId] = bookIds;
    this.selectedTrainingSourceBooks$.next(current);
  }

  selectTargetTrainingBooks(books: string[]): void {
    if (this.inputMode$.getValue() !== 'training_books') {
      throw new Error('Cannot update training books when not in training_books input mode');
    }
    const newTargetTrainingScriptureRange = new VerboseScriptureRange('');
    for (const bookId of books) {
      const bookRange = this.availableTargetTrainingScriptureRange$.getValue().books.get(bookId);
      if (bookRange == null) {
        throw new Error(`Selected book ${bookId} not in available target training scripture range`);
      }
      newTargetTrainingScriptureRange.books.set(bookId, bookRange.clone());
    }
    this.selectedTargetTrainingScriptureRange$.next(newTargetTrainingScriptureRange);

    const partialBookTargetTrainingBooks = books.filter(bookId => this.isBookEligibleForPartialTargetTraining(bookId));
    this.booksOfferedForPartialTargetTraining$.next(partialBookTargetTrainingBooks);
  }

  private isBookEligibleForPartialTargetTraining(bookId: string): boolean {
    // Only books offered for partial drafting can have their target training chapters selected individually.
    // Additionally, at least one target chapter must remain available for training after the drafted chapters are
    // excluded.
    if (!this.booksOfferedForPartialDrafting$.getValue().includes(bookId)) return false;

    const chaptersAvailableForTraining = this.availableTargetTrainingScriptureRange$.getValue().books.get(bookId);
    return chaptersAvailableForTraining != null && chaptersAvailableForTraining.count() >= 1;
  }

  abort(mode: NewDraftAbortMode): void {
    this.abortMode$.next(mode);
    this.status$.next('abort');
  }

  private loadPreviouslySelectedTrainingBooks(): void {
    const draftConfig = this.activatedProjectService.projectDoc?.data?.translateConfig?.draftConfig;
    if (draftConfig == null) throw new Error('Draft config not found in project data');
    const targetProjectId = this.activatedProjectService.projectId;
    const lastSelectedTrainingScriptureRanges = draftConfig.lastSelectedTrainingScriptureRanges ?? [];

    // Restore the previously selected books for each training source, ignoring the target project's own entry (handled
    // separately below). Only keep books that are still available for training in that source.
    const selectedTrainingSourceBooksByProjectId: { [key: string]: string[] } = {};
    for (const sourceScriptureRange of lastSelectedTrainingScriptureRanges) {
      if (sourceScriptureRange.projectId === targetProjectId) continue;
      const previouslySelectedBooks = Array.from(
        new VerboseScriptureRange(sourceScriptureRange.scriptureRange).books.keys()
      );
      const booksAvailableForTraining =
        this.availableTrainingSourceBooks$.getValue()[sourceScriptureRange.projectId] ?? [];
      selectedTrainingSourceBooksByProjectId[sourceScriptureRange.projectId] = previouslySelectedBooks.filter(bookId =>
        booksAvailableForTraining.includes(bookId)
      );
    }
    this.selectedTrainingSourceBooks$.next(selectedTrainingSourceBooksByProjectId);

    // Determine the previously selected target training books. Prefer the target project's own saved entry (looked up
    // by project ID); its chapter detail is ignored so that chapter defaults are re-derived from current project
    // state. Older draft configs predate saving a target entry, so when none exists fall back to inferring it from
    // the union of the selected source training books (the previous behavior).
    const savedTargetTrainingRange = lastSelectedTrainingScriptureRanges.find(
      range => range.projectId === targetProjectId
    );
    const previouslySelectedTargetBooks =
      savedTargetTrainingRange != null
        ? Array.from(new VerboseScriptureRange(savedTargetTrainingRange.scriptureRange).books.keys())
        : Array.from(new Set(Object.values(selectedTrainingSourceBooksByProjectId).flat()));

    // Run the books through the normal book-selection path so chapter defaults match a manual selection. Filter to
    // books still available for target training first, since selectTargetTrainingBooks requires available books.
    const availableTargetTrainingScriptureRange = this.availableTargetTrainingScriptureRange$.getValue();
    const availableTargetBooks = previouslySelectedTargetBooks.filter(bookId =>
      availableTargetTrainingScriptureRange.books.has(bookId)
    );
    this.selectTargetTrainingBooks(availableTargetBooks);
  }

  private limitAvailableTrainingRangeBasedOnSelectedDraftingRange(): void {
    // Available target training books are the target's content minus what's being drafted, further limited to books
    // that exist in at least one training source: a target book can only be used as training data if a source
    // provides the matching book to pair it with. Books with no such source are recorded
    // (targetTrainingBooksWithoutSource$) so the UI can explain why they aren't offered.
    const targetTrainingRange = this.targetProjectScriptureRange.difference(
      this.selectedDraftingScriptureRange$.getValue()
    );
    const booksInAnyTrainingSource = new Set(Object.values(this.trainingSourceBooks$.getValue()).flat());

    const availableTargetTrainingRange = new VerboseScriptureRange('');
    const booksWithoutSource: string[] = [];
    for (const [bookId, chapters] of targetTrainingRange.books) {
      if (booksInAnyTrainingSource.has(bookId)) {
        availableTargetTrainingRange.books.set(bookId, chapters);
      } else {
        booksWithoutSource.push(bookId);
      }
    }
    this.availableTargetTrainingScriptureRange$.next(availableTargetTrainingRange);
    this.targetTrainingBooksWithoutSource$.next(booksWithoutSource);
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
