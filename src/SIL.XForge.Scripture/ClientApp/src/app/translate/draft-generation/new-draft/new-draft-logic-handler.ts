import { DestroyRef } from '@angular/core';
import { Canon } from '@sillsdev/scripture';
import { mapValues } from 'lodash-es';
import { BehaviorSubject, firstValueFrom, skip } from 'rxjs';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { filterNullish, quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { ChapterSet, VerboseScriptureRange } from '../../../shared/scripture-range';
import { projectLabel } from '../../../shared/utils';
import { DraftSourcesAsArrays } from '../draft-source';
import { DraftSourcesService } from '../draft-sources.service';
import { DraftProgressService } from './draft-progress.service';

/**
 * Minimum number of chapters a source book must have before it is offered for partial (chapter-level) drafting.
 * Books smaller than this are only ever drafted in full.
 */
const MIN_SOURCE_CHAPTERS_FOR_PARTIAL_DRAFTING = 12;

/**
 * Why a book that a user might expect to see was left out of the list offered for drafting. Every excluded book is
 * recorded with its reason so the UI can explain the omission. 'not_in_source' means the drafting source doesn't
 * contain the book at all, while 'no_source_content' means it contains the book but every chapter is blank. Not every
 * reason is surfaced to the user: 'non_canonical' books (front/back matter, glossaries, etc.) are excluded silently,
 * since users don't expect them to be draftable.
 */
export type DraftingBookExclusionReason = 'non_canonical' | 'no_source_content' | 'not_in_source';

export interface ExcludedDraftingBook {
  bookId: string;
  reason: DraftingBookExclusionReason;
}

export type NewDraftAbortMode = 'config_changed' | 'project_syncing' | 'no_access' | 'init_failure' | null;

/**
 * Returns the book IDs in a ScriptureRange, dropping the chapter-level detail. Useful when only the set of books
 * matters, such as determining which books users can select. Books with no chapters are already pruned when ranges are
 * built (see getChaptersWithContent and VerboseScriptureRange.removeEmptyBooks), so every returned book is selectable.
 */
export function scriptureRangeToBookListWithoutChapterDetail(range: VerboseScriptureRange): string[] {
  return Array.from(range.books.keys());
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
  status$ = new BehaviorSubject<'init' | 'input' | 'abort'>('init');
  abortMode: NewDraftAbortMode = null;

  /** Names of the projects that could not be accessed, populated when aborting with mode 'no_access'. */
  inaccessibleProjectNames: string[] = [];
  /** The error that caused an 'init_failure' abort, retained so the component can report it. */
  initError?: unknown;

  // A book can be present (in a project), available (logic rules do not forbit selecting it, and it is therefore
  // offered in the UI), and selected (user action, or default values selected the )
  availableDraftingScriptureRange: VerboseScriptureRange = new VerboseScriptureRange();
  selectedDraftingScriptureRange: VerboseScriptureRange = new VerboseScriptureRange();

  /** Books left out of the drafting list, with the reason for each (see DraftingBookExclusionReason). */
  excludedDraftingBooks: ExcludedDraftingBook[] = [];

  targetProjectScriptureRange = new VerboseScriptureRange();
  availableTargetTrainingScriptureRange: VerboseScriptureRange = new VerboseScriptureRange();
  selectedTargetTrainingScriptureRange: VerboseScriptureRange = new VerboseScriptureRange();

  // The chapters each project contains, including blank ones (the ranges above are content-based, so a chapter can be
  // missing from them for either reason). Used to word chapter errors correctly: "blank" vs "not in the project".
  targetPresentChapters: VerboseScriptureRange = new VerboseScriptureRange();
  draftingSourcePresentChapters: VerboseScriptureRange = new VerboseScriptureRange();

  /**
   * Whether training books were automatically selected on this project's first draft (no previously saved training
   * selection). Used to show the "review the pre-selected books" notice on the training step.
   */
  trainingBooksWereAutoSelected: boolean = false;

  /** Target books that appear complete enough to auto-select as training data (see getCompleteBookIds). */
  private completeTargetBookIds = new Set<string>();

  /**
   * Target books that have content available for training but are not offered, because no training source contains
   * the book (so it could never be paired with a source). Populated when the training step is entered; used to explain
   * why those books are missing from the target training list.
   */
  targetTrainingBooksWithoutSource: string[] = [];

  /** Books that exist in the training sources, by project ID */
  trainingSourceBooks: { [projectId: string]: string[] } = {};
  availableTrainingSourceBooks: { [projectId: string]: string[] } = {};
  selectedTrainingSourceBooks: { [projectId: string]: string[] } = {};

  get booksOfferedForPartialDrafting(): string[] {
    return Array.from(this.selectedDraftingScriptureRange.books.keys()).filter(bookId =>
      this.isBookEligibleForPartialDrafting(bookId)
    );
  }

  get booksOfferedForPartialTargetTraining(): string[] {
    // Only books offered for partial drafting can have their target training chapters selected individually, and at
    // least one target chapter must remain available for training.
    const booksOfferedForPartialDrafting = new Set(this.booksOfferedForPartialDrafting);
    return Array.from(this.selectedTargetTrainingScriptureRange.books.keys()).filter(bookId => {
      if (!booksOfferedForPartialDrafting.has(bookId)) return false;
      const chaptersAvailableForTraining = this.availableTargetTrainingScriptureRange.books.get(bookId);
      return chaptersAvailableForTraining != null && chaptersAvailableForTraining.count() >= 1;
    });
  }

  /**
   * SPecifies what input mode the user is using. When a book is selected for use as drafting, it must be automatically
   * removed from being used as training. However, if a user selects and unselects a book while selecting books to
   * draft, that book shouldn't be automatically removed from being used as training data. Tracking the input state
   * allows update rules to be enforced at the right point in time.
   */
  inputMode: 'draft_books' | 'training_books' = 'draft_books';

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
   * progress data, and setting up subscriptions that watch for changes that should result in bailing out (forcing the
   * user to restart the process). Automatically sets training books to most recently selected training books.
   */
  async init(): Promise<void> {
    try {
      const [bundle, sources] = await Promise.all([
        this.fetchProgressBundle(),
        firstValueFrom(this.draftSourcesService.getDraftProjectSources())
      ]);
      this.sources = sources;

      const sourcesWithNoAccess = [
        ...this.sources.trainingSources,
        ...this.sources.trainingTargets,
        ...this.sources.draftingSources
      ].filter(source => source.noAccess);
      if (sourcesWithNoAccess.length > 0) {
        this.inaccessibleProjectNames = sourcesWithNoAccess
          .map(source => projectLabel(source))
          .filter(label => label !== '');
        this.abort('no_access');
        return;
      }

      this.applyDerivedRanges(bundle);

      this.status$.next('input');

      // Watch for changes to which projects are configured (not their content). A source-identity change means
      // the wizard was operating on a stale premise and must abort. Skip the initial emission (baseline).
      const baselineSignature = this.sourceConfigSignature(this.sources);
      this.draftSourcesService
        .getDraftProjectSources()
        .pipe(skip(1), quietTakeUntilDestroyed(this.destroyRef))
        .subscribe(newSources => {
          if (this.sourceConfigSignature(newSources) !== baselineSignature) {
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

  /**
   * Loads the progress data needed to derive book/chapter availability: the drafting source's content, the target's
   * content, each training source's content, and the set of target books that appear complete (for auto-selection).
   * Recently fetched projects are served from cache, except that ProgressService refetches any project that has
   * synced since its cache entry was fetched (so a reload after an in-place sync gets post-sync data automatically).
   */
  private async fetchProgressBundle(): Promise<{
    draftSourceProgress: VerboseScriptureRange;
    draftSourcePresentChapters: VerboseScriptureRange;
    targetProjectProgress: VerboseScriptureRange;
    targetPresentChapters: VerboseScriptureRange;
    trainingSourcesProgress: { projectId: string; range: VerboseScriptureRange }[];
    completeTargetBookIds: Set<string>;
  }> {
    const projectId = await firstValueFrom(this.activatedProjectService.projectId$.pipe(filterNullish()));
    const projectDoc = await firstValueFrom(this.activatedProjectService.projectDoc$.pipe(filterNullish()));

    if (projectId == null) throw new Error('No project selected');
    if (projectDoc?.data == null) throw new Error('Project data not loaded');

    const draftConfig = projectDoc.data.translateConfig?.draftConfig;
    if (draftConfig == null) throw new Error('Draft config not found in project data');

    // The UI never allows configuring more than one drafting source, so this is treated as an impossible state.
    if (draftConfig.draftingSources.length !== 1) {
      throw new Error(`Expected exactly one drafting source; found ${draftConfig.draftingSources.length}`);
    }
    const draftingSource = draftConfig.draftingSources[0];

    const trainingSourcesProgressPromise = Promise.all(
      draftConfig.trainingSources.map(async trainingSource => {
        const range = await this.progressService.getChaptersWithContent(trainingSource.projectRef);
        return { projectId: trainingSource.projectRef, range };
      })
    );

    // Order matters: each project's content range (getChaptersWithContent) is invoked before its other reads
    // (getPresentChapters, getCompleteBookIds) so all reads of the same project coalesce onto a single in-flight
    // request.
    const [
      draftSourceProgress,
      draftSourcePresentChapters,
      targetProjectProgress,
      targetPresentChapters,
      trainingSourcesProgress,
      completeTargetBookIds
    ] = await Promise.all([
      this.progressService.getChaptersWithContent(draftingSource.projectRef),
      this.progressService.getPresentChapters(draftingSource.projectRef),
      this.progressService.getChaptersWithContent(projectId),
      this.progressService.getPresentChapters(projectId),
      trainingSourcesProgressPromise,
      this.progressService.getCompleteBookIds(projectId)
    ]);

    return {
      draftSourceProgress,
      draftSourcePresentChapters,
      targetProjectProgress,
      targetPresentChapters,
      trainingSourcesProgress,
      completeTargetBookIds
    };
  }

  /**
   * Derives the offered drafting books, available ranges, and training-source book lists from a freshly loaded progress
   * bundle and publishes them on the relevant subjects. Reads the target's text list from the (live) project doc for
   * membership, so a reload after an in-place sync picks up newly synced books. Does not touch the user's selections.
   */
  private applyDerivedRanges(bundle: {
    draftSourceProgress: VerboseScriptureRange;
    draftSourcePresentChapters: VerboseScriptureRange;
    targetProjectProgress: VerboseScriptureRange;
    targetPresentChapters: VerboseScriptureRange;
    trainingSourcesProgress: { projectId: string; range: VerboseScriptureRange }[];
    completeTargetBookIds: Set<string>;
  }): void {
    const texts = this.activatedProjectService.projectDoc?.data?.texts ?? [];
    const targetTextBookIds = new Set(texts.map(text => Canon.bookNumberToId(text.bookNum)));
    const { available, excluded } = this.computeOfferedDraftingBooks(
      bundle.draftSourceProgress,
      bundle.draftSourcePresentChapters,
      targetTextBookIds
    );

    // Extra-material books are never offered for training (drafting handles them separately).
    const canonicalTargetProgress = withoutExtraMaterialBooks(bundle.targetProjectProgress);

    this.completeTargetBookIds = bundle.completeTargetBookIds;
    this.targetProjectScriptureRange = canonicalTargetProgress;
    this.availableDraftingScriptureRange = available;
    this.excludedDraftingBooks = excluded;
    this.targetPresentChapters = bundle.targetPresentChapters;
    this.draftingSourcePresentChapters = bundle.draftSourcePresentChapters;
    // Clone: this range is narrowed in limitAvailableTrainingRangeBasedOnSelectedDraftingRange, so it must not alias
    // targetProjectScriptureRange.
    this.availableTargetTrainingScriptureRange = canonicalTargetProgress.clone();
    this.trainingSourceBooks = Object.fromEntries(
      bundle.trainingSourcesProgress.map(source => [
        source.projectId,
        scriptureRangeToBookListWithoutChapterDetail(withoutExtraMaterialBooks(source.range))
      ])
    );
  }

  /**
   * Re-derives book/chapter availability after the user syncs stale projects in place via the pending-updates
   * pre-step. ProgressService notices which projects have synced since their cache entries were fetched and refetches
   * exactly those; unchanged projects are served from cache. Valid only before the user has made any selection (the
   * pre-step precedes Step 1), so it returns the selection state to its post-init baseline rather than trying to
   * preserve stale selections.
   */
  async reload(): Promise<void> {
    const bundle = await this.fetchProgressBundle();
    this.applyDerivedRanges(bundle);
    this.resetSelectionState();
  }

  /** Returns all selection-derived state to its post-init baseline. */
  private resetSelectionState(): void {
    this.selectedDraftingScriptureRange = new VerboseScriptureRange();
    this.selectedTargetTrainingScriptureRange = new VerboseScriptureRange();
    this.selectedTrainingSourceBooks = {};
    this.availableTrainingSourceBooks = {};
    this.targetTrainingBooksWithoutSource = [];
    this.trainingBooksWereAutoSelected = false;
    this.hasVisitedTrainingBooksInputMode = false;
    this.inputMode = 'draft_books';
  }

  private hasVisitedTrainingBooksInputMode = false;
  setInputMode(newMode: 'draft_books' | 'training_books'): void {
    const priorMode = this.inputMode;
    // Switch the mode first so that loadPreviouslySelectedTrainingBooks() can use the normal training-book selection
    // path (e.g. selectTargetTrainingBooks), which requires being in training_books mode.
    this.inputMode = newMode;
    if (priorMode === 'draft_books' && newMode === 'training_books') {
      this.limitAvailableTrainingRangeBasedOnSelectedDraftingRange();
      if (!this.hasVisitedTrainingBooksInputMode) {
        this.loadPreviouslySelectedTrainingBooks();
        this.hasVisitedTrainingBooksInputMode = true;
      }
    }
  }

  selectDraftingBooks(books: string[]): void {
    if (this.inputMode !== 'draft_books') {
      throw new Error('Cannot update draft books when not in draft_books input mode');
    }

    const newDraftingScriptureRange = new VerboseScriptureRange();
    const newlySelectedBooks = books.filter(book => !this.selectedDraftingScriptureRange.books.has(book));

    for (const book of books) {
      if (!this.availableDraftingScriptureRange.books.has(book)) {
        throw new Error(`Selected book ${book} not in available drafting scripture range`);
      }
      if (newlySelectedBooks.includes(book)) {
        const chaptersInTarget = this.targetProjectScriptureRange.books.get(book);
        const chaptersInSource = this.availableDraftingScriptureRange.books.get(book);
        if (chaptersInSource == null)
          throw new Error(`Selected book ${book} not in available drafting scripture range`);
        // Only books eligible for partial drafting get a chapter input, so only they may default to a subset.
        // Default an eligible book to the untranslated chapters (those in the source but not the target), falling
        // back to the whole book when none remain untranslated. A book that is not eligible has no input, so it must
        // default to the whole book; defaulting it to a subset would silently drop chapters the user couldn't add
        // back.
        if (this.isBookEligibleForPartialDrafting(book) && chaptersInTarget != null) {
          const newChaptersToDraft = chaptersInSource.difference(chaptersInTarget);
          newDraftingScriptureRange.books.set(
            book,
            newChaptersToDraft.count() > 0 ? newChaptersToDraft : chaptersInSource.clone()
          );
        } else {
          newDraftingScriptureRange.books.set(book, chaptersInSource.clone());
        }
      } else {
        const alreadySelectedChapters = this.selectedDraftingScriptureRange.books.get(book);
        if (alreadySelectedChapters == null) throw new Error('This should be unreachable');
        newDraftingScriptureRange.books.set(book, alreadySelectedChapters);
      }
    }
    this.selectedDraftingScriptureRange = newDraftingScriptureRange;
  }

  selectDraftingChapters(bookId: string, chapters: string): void {
    if (this.inputMode !== 'draft_books') {
      throw new Error('Cannot update draft books when not in draft_books input mode');
    }

    const selectedChapters = ChapterSet.fromUserInput(chapters);

    if (!this.booksOfferedForPartialDrafting.includes(bookId)) {
      throw new Error(`Book ${bookId} is not eligible for partial drafting`);
    }
    const chaptersInSource = this.availableDraftingScriptureRange.books.get(bookId);
    if (chaptersInSource == null) throw new Error(`Book ${bookId} not in available drafting scripture range`);
    const selectedChaptersNotInSource = selectedChapters.difference(chaptersInSource);
    if (selectedChaptersNotInSource.count() > 0) {
      throw new Error(
        `Selected chapters ${selectedChaptersNotInSource.toString()} are not in the available drafting scripture range for book ${bookId}`
      );
    }

    const newDraftingScriptureRange = this.selectedDraftingScriptureRange.clone();
    newDraftingScriptureRange.books.set(bookId, selectedChapters);
    this.selectedDraftingScriptureRange = newDraftingScriptureRange;
  }

  /**
   * Determines which books from the drafting source are offered for drafting, and records why each book the user might
   * expect to see was left out. A book is offered only if it is canonical and has content in the drafting source.
   *
   * The books considered are those with content in the drafting source plus those present in the target project. This
   * lets the UI explain books the target contains but the source can't draft, distinguishing books the source doesn't
   * contain at all ('not_in_source') from books it contains only blank ('no_source_content'). Books that are excluded
   * purely for being non-canonical are recorded as 'non_canonical' but are not surfaced to the user.
   */
  private computeOfferedDraftingBooks(
    draftSourceProgress: VerboseScriptureRange,
    draftSourcePresentChapters: VerboseScriptureRange,
    targetTextBookIds: Set<string>
  ): { available: VerboseScriptureRange; excluded: ExcludedDraftingBook[] } {
    const available = new VerboseScriptureRange();
    const excluded: ExcludedDraftingBook[] = [];

    const booksToConsider = new Set<string>([...draftSourceProgress.books.keys(), ...targetTextBookIds]);
    // Evaluate in canonical order so the excluded list (and any notice built from it) reads naturally.
    const orderedBooks = Array.from(booksToConsider).sort((a, b) => Canon.bookIdToNumber(a) - Canon.bookIdToNumber(b));

    for (const bookId of orderedBooks) {
      if (Canon.isExtraMaterial(bookId)) {
        excluded.push({ bookId, reason: 'non_canonical' });
      } else if (!draftSourceProgress.books.has(bookId)) {
        const reason = draftSourcePresentChapters.books.has(bookId) ? 'no_source_content' : 'not_in_source';
        excluded.push({ bookId, reason });
      } else {
        available.books.set(bookId, draftSourceProgress.books.get(bookId)!.clone());
      }
    }

    return { available, excluded };
  }

  private isBookEligibleForPartialDrafting(bookId: string): boolean {
    const sourceChapterCount = this.availableDraftingScriptureRange.books.get(bookId)?.count();
    const targetChaptersWithContent = this.targetProjectScriptureRange.books.get(bookId)?.count();

    return (
      sourceChapterCount != null &&
      sourceChapterCount >= MIN_SOURCE_CHAPTERS_FOR_PARTIAL_DRAFTING &&
      targetChaptersWithContent != null &&
      targetChaptersWithContent >= 1
    );
  }

  selectTargetTrainingChapters(bookId: string, chapters: string): void {
    if (this.inputMode !== 'training_books') {
      throw new Error('Cannot update training chapters when not in training_books input mode');
    }

    const selectedChapters = ChapterSet.fromUserInput(chapters);

    if (!this.booksOfferedForPartialTargetTraining.includes(bookId)) {
      throw new Error(`Book ${bookId} is not eligible for partial target training`);
    }
    const chaptersAvailableForTraining = this.availableTargetTrainingScriptureRange.books.get(bookId);
    if (chaptersAvailableForTraining == null)
      throw new Error(`Book ${bookId} not in available target training scripture range`);
    const selectedChaptersNotAvailable = selectedChapters.difference(chaptersAvailableForTraining);
    if (selectedChaptersNotAvailable.count() > 0) {
      throw new Error(
        `Selected chapters ${selectedChaptersNotAvailable.toString()} are not available for target training for book ${bookId}`
      );
    }

    const newTargetTrainingScriptureRange = this.selectedTargetTrainingScriptureRange.clone();
    newTargetTrainingScriptureRange.books.set(bookId, selectedChapters);
    this.selectedTargetTrainingScriptureRange = newTargetTrainingScriptureRange;
  }

  selectTrainingSourceBooks(projectId: string, bookIds: string[]): void {
    if (this.inputMode !== 'training_books') {
      throw new Error('Cannot update training source books when not in training_books input mode');
    }
    const available = this.availableTrainingSourceBooks[projectId] ?? [];
    for (const bookId of bookIds) {
      if (!available.includes(bookId)) {
        throw new Error(`Selected book ${bookId} is not available for training source project ${projectId}`);
      }
    }
    const current = { ...this.selectedTrainingSourceBooks };
    current[projectId] = bookIds;
    this.selectedTrainingSourceBooks = current;
  }

  selectTargetTrainingBooks(books: string[]): void {
    if (this.inputMode !== 'training_books') {
      throw new Error('Cannot update training books when not in training_books input mode');
    }
    const newTargetTrainingScriptureRange = new VerboseScriptureRange();
    for (const bookId of books) {
      const bookRange = this.availableTargetTrainingScriptureRange.books.get(bookId);
      if (bookRange == null) {
        throw new Error(`Selected book ${bookId} not in available target training scripture range`);
      }
      newTargetTrainingScriptureRange.books.set(bookId, bookRange.clone());
    }
    this.selectedTargetTrainingScriptureRange = newTargetTrainingScriptureRange;
  }

  /**
   * A stable fingerprint of which projects are configured as drafting/training sources, used to detect mid-flow
   * reconfiguration. Only the set of project refs matters (order-independent); the target is excluded since it is
   * fixed (it is the activated project). Content and sync changes deliberately do not affect this signature.
   */
  private sourceConfigSignature(sources: DraftSourcesAsArrays): string {
    const refs = [...sources.draftingSources, ...sources.trainingSources].map(source => source.projectRef);
    return JSON.stringify([...new Set(refs)].sort());
  }

  abort(mode: NewDraftAbortMode): void {
    this.abortMode = mode;
    this.status$.next('abort');
  }

  private loadPreviouslySelectedTrainingBooks(): void {
    const draftConfig = this.activatedProjectService.projectDoc?.data?.translateConfig?.draftConfig;
    if (draftConfig == null) throw new Error('Draft config not found in project data');
    const targetProjectId = this.activatedProjectService.projectId;
    const lastSelectedTrainingScriptureRanges = draftConfig.lastSelectedTrainingScriptureRanges ?? [];

    // On a project's first draft there is nothing to restore; auto-select a default instead.
    if (lastSelectedTrainingScriptureRanges.length === 0) {
      this.autoSelectTrainingBooks();
      return;
    }

    // Restore the previously selected books for each training source, ignoring the target project's own entry (handled
    // separately below). Only keep books that are still available for training in that source.
    const selectedTrainingSourceBooksByProjectId: { [key: string]: string[] } = {};
    for (const sourceScriptureRange of lastSelectedTrainingScriptureRanges) {
      if (sourceScriptureRange.projectId === targetProjectId) continue;
      const previouslySelectedBooks = scriptureRangeToBookListWithoutChapterDetail(
        new VerboseScriptureRange(sourceScriptureRange.scriptureRange)
      );
      const booksAvailableForTraining = this.availableTrainingSourceBooks[sourceScriptureRange.projectId] ?? [];
      selectedTrainingSourceBooksByProjectId[sourceScriptureRange.projectId] = previouslySelectedBooks.filter(bookId =>
        booksAvailableForTraining.includes(bookId)
      );
    }
    this.selectedTrainingSourceBooks = selectedTrainingSourceBooksByProjectId;

    // Determine the previously selected target training books. Prefer the target project's own saved entry (looked up
    // by project ID); its chapter detail is ignored so that chapter defaults are re-derived from current project
    // state. Older draft configs predate saving a target entry, so when none exists fall back to inferring it from
    // the union of the selected source training books (the previous behavior).
    const savedTargetTrainingRange = lastSelectedTrainingScriptureRanges.find(
      range => range.projectId === targetProjectId
    );
    const previouslySelectedTargetBooks =
      savedTargetTrainingRange != null
        ? scriptureRangeToBookListWithoutChapterDetail(
            new VerboseScriptureRange(savedTargetTrainingRange.scriptureRange)
          )
        : Array.from(new Set(Object.values(selectedTrainingSourceBooksByProjectId).flat()));

    // Run the books through the normal book-selection path so chapter defaults match a manual selection. Filter to
    // books still available for target training first, since selectTargetTrainingBooks requires available books.
    const availableTargetTrainingScriptureRange = this.availableTargetTrainingScriptureRange;
    const availableTargetBooks = previouslySelectedTargetBooks.filter(bookId =>
      availableTargetTrainingScriptureRange.books.has(bookId)
    );
    this.selectTargetTrainingBooks(availableTargetBooks);
  }

  /**
   * Auto-selects training books on a project's first draft. Picks only books that appear fully translated (see
   * getCompleteBookIds) and are not being drafted, then pairs each with its source books. Uses a high bar because the
   * selection is persisted and reused and a wrong pick silently degrades future drafts.
   */
  private autoSelectTrainingBooks(): void {
    const availableTargetTrainingRange = this.availableTargetTrainingScriptureRange;
    const draftedBooks = this.selectedDraftingScriptureRange.books;
    const booksToAutoSelect = Array.from(availableTargetTrainingRange.books.keys()).filter(
      bookId => this.completeTargetBookIds.has(bookId) && !draftedBooks.has(bookId)
    );

    this.selectTargetTrainingBooks(booksToAutoSelect);

    // Pair each auto-selected book with matching source books, same as a manual selection would.
    const autoSelected = new Set(booksToAutoSelect);
    this.selectedTrainingSourceBooks = mapValues(this.availableTrainingSourceBooks, bookIds =>
      bookIds.filter(bookId => autoSelected.has(bookId))
    );

    this.trainingBooksWereAutoSelected = booksToAutoSelect.length > 0;
  }

  /** Clears the auto-selected notice once the user has deselected all target training books. */
  dismissAutoSelectNoticeIfSelectionEmpty(): void {
    if (this.trainingBooksWereAutoSelected && this.selectedTargetTrainingScriptureRange.books.size === 0) {
      this.trainingBooksWereAutoSelected = false;
    }
  }

  /**
   * The scripture range to withhold from the training options, so that training data never overlaps what is being
   * drafted. It is not simply selectedDraftingScriptureRange, which holds only the chapters the source can draft and
   * is submitted verbatim as the draft request. What counts as "being drafted" for this purpose depends on how the
   * book was selected:
   *
   * - Partial-eligible book: the user was shown a chapter selector, so only the chapters they chose count. Those are
   *   withheld, and the book's remaining chapters stay available for training (the "draft some, train on the rest" case).
   * - Whole-book draft: no chapter selector was offered, so the whole book counts as being drafted, including the
   *   chapters the source cannot draft. The entire book is withheld, so those chapters are not silently offered as
   *   training data.
   */
  private draftingRangeExcludedFromTraining(): VerboseScriptureRange {
    const excluded = new VerboseScriptureRange();
    for (const [bookId, draftedChapters] of this.selectedDraftingScriptureRange.books) {
      if (this.isBookEligibleForPartialDrafting(bookId)) {
        excluded.books.set(bookId, draftedChapters.clone());
      } else {
        // Withhold the whole book. Use its chapters in the target, since the training options are derived from the
        // target's content; a book with no target content has nothing to withhold.
        const targetChapters = this.targetProjectScriptureRange.books.get(bookId);
        if (targetChapters != null) {
          excluded.books.set(bookId, targetChapters.clone());
        }
      }
    }
    return excluded;
  }

  private limitAvailableTrainingRangeBasedOnSelectedDraftingRange(): void {
    // Available target training books are the target's content minus what's being drafted, further limited to books
    // that exist in at least one training source: a target book can only be used as training data if a source
    // provides the matching book to pair it with. Books with no such source are recorded
    // (targetTrainingBooksWithoutSource) so the UI can explain why they aren't offered.
    const excludedFromTraining = this.draftingRangeExcludedFromTraining();
    const targetTrainingRange = this.targetProjectScriptureRange.difference(excludedFromTraining);
    const booksInAnyTrainingSource = new Set(Object.values(this.trainingSourceBooks).flat());

    const availableTargetTrainingRange = new VerboseScriptureRange();
    const booksWithoutSource: string[] = [];
    for (const [bookId, chapters] of targetTrainingRange.books) {
      if (booksInAnyTrainingSource.has(bookId)) {
        availableTargetTrainingRange.books.set(bookId, chapters);
      } else {
        booksWithoutSource.push(bookId);
      }
    }
    this.availableTargetTrainingScriptureRange = availableTargetTrainingRange;
    this.targetTrainingBooksWithoutSource = booksWithoutSource;
    this.selectedTargetTrainingScriptureRange =
      this.selectedTargetTrainingScriptureRange.difference(excludedFromTraining);

    // Limit available and selected training source books to not exceed available target training scripture range
    const availableTargetRange = this.availableTargetTrainingScriptureRange;
    this.availableTrainingSourceBooks = mapValues(this.trainingSourceBooks, bookIds =>
      bookIds.filter(bookId => availableTargetRange.books.has(bookId))
    );
    this.selectedTrainingSourceBooks = mapValues(this.selectedTrainingSourceBooks, (bookIds, projectId) =>
      bookIds.filter(bookId => this.availableTrainingSourceBooks[projectId]?.includes(bookId))
    );
  }
}
