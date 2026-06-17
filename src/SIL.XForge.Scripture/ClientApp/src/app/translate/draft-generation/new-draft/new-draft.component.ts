import { CommonModule } from '@angular/common';
import { Component, DestroyRef, ErrorHandler } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { Canon } from '@sillsdev/scripture';
import { TrainingData } from 'realtime-server/lib/esm/scriptureforge/models/training-data';
import { ProjectScriptureRange } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { filter, firstValueFrom, take } from 'rxjs';
import { ErrorReportingService } from 'xforge-common/error-reporting.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { hasStringProp } from '../../../../type-utils';
import { ActivatedProjectService } from '../../../../xforge-common/activated-project.service';
import { FeatureFlagService } from '../../../../xforge-common/feature-flags/feature-flag.service';
import { I18nKeyForComponent, I18nService } from '../../../../xforge-common/i18n.service';
import { UserDoc } from '../../../../xforge-common/models/user-doc';
import { UserService } from '../../../../xforge-common/user.service';
import { filterNullish, quietTakeUntilDestroyed } from '../../../../xforge-common/util/rxjs-util';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { ParatextProject } from '../../../core/models/paratext-project';
import { ParatextService } from '../../../core/paratext.service';
import { SFProjectService } from '../../../core/sf-project.service';
import { isSFProjectSyncing } from '../../../sync/sync.component';
import { Book } from '../../../shared/book-multi-select/book-multi-select';
import { BookMultiSelectComponent } from '../../../shared/book-multi-select/book-multi-select.component';
import { CopyrightBannerComponent } from '../../../shared/copyright-banner/copyright-banner.component';
import { NoticeComponent } from '../../../shared/notice/notice.component';
import { projectLabel } from '../../../shared/utils';
import { NllbLanguageService } from '../../nllb-language.service';
import { ConfirmSourcesComponent } from '../confirm-sources/confirm-sources.component';
import { BuildConfig } from '../draft-generation';
import { DraftGenerationService } from '../draft-generation.service';
import { DraftSource } from '../draft-source';
import { DraftSourcesService } from '../draft-sources.service';
import { TrainingDataService } from '../training-data/training-data.service';
import { DraftPendingUpdatesComponent } from './draft-pending-updates/draft-pending-updates.component';
import {
  DraftingBookExclusionReason,
  DraftProgressService,
  NewDraftAbortMode,
  NewDraftLogicHandler,
  scriptureRangeToBookListWithoutChapterDetail
} from './new-draft-logic-handler';
import { ChapterSet, VerboseScriptureRange } from './scripture-range';
import { defaultSelectedTrainingDataFiles } from './training-data-file-selection';
import { formatTrainingBooksSummary } from './training-data-summary';

interface CopyrightMessage {
  banner: string;
  notice?: string;
}

interface ChapterInputError {
  key: I18nKeyForComponent<'new_draft'>;
  params?: object;
}

function formatChapterRange(range: string): string {
  return range.replace(/,/g, ', ');
}

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
    CopyrightBannerComponent,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatIconModule,
    BookMultiSelectComponent,
    MatFormFieldModule,
    MatInputModule,
    NoticeComponent,
    DraftPendingUpdatesComponent,
    FormsModule,
    TranslocoModule,
    CommonModule
  ]
})
export class NewDraftComponent {
  logicHandler: NewDraftLogicHandler;

  page: (typeof PAGES_BY_ORDER)[number]['page'] | 'loading' | 'pending_updates' | 'abort' = 'loading';

  pendingProjects: { projectId: string; name: string }[] = [];

  draftingChapterErrors = new Map<string, ChapterInputError>();
  targetTrainingChapterErrors = new Map<string, ChapterInputError>();
  stepError: I18nKeyForComponent<'new_draft'> | null = null;

  /** Whether the "N books are hidden" explanations are expanded, on the draft step and the training step respectively. */
  draftingExclusionsExpanded = false;
  trainingExclusionsExpanded = false;

  sendEmailOnBuildFinished: boolean = false;
  fastTraining: boolean = false;
  useEcho: boolean = false;
  isTrainingOptional: boolean = false;

  /** All training data files currently available for the project. */
  trainingDataFiles: TrainingData[] = [];
  /** DataIds of the training data files the user has chosen to include in this build. */
  selectedTrainingDataFileIds = new Set<string>();
  private hasInitializedTrainingDataSelection = false;

  // Data that is guarnateed to be loaded post init
  initData?: { projectId: string };

  private currentUserDoc?: UserDoc;

  constructor(
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly draftSourcesService: DraftSourcesService,
    private readonly draftGenerationService: DraftGenerationService,
    private readonly progressService: DraftProgressService,
    readonly i18n: I18nService,
    readonly featureFlags: FeatureFlagService,
    protected readonly onlineStatusService: OnlineStatusService,
    private readonly userService: UserService,
    private readonly router: Router,
    private readonly nllbLanguageService: NllbLanguageService,
    private readonly paratextService: ParatextService,
    private readonly errorReportingService: ErrorReportingService,
    private readonly errorHandler: ErrorHandler,
    private readonly trainingDataService: TrainingDataService,
    private readonly projectService: SFProjectService,
    private readonly destroyRef: DestroyRef
  ) {
    this.logicHandler = new NewDraftLogicHandler(
      this.activatedProjectService,
      this.draftSourcesService,
      this.progressService,
      this.destroyRef
    );

    void this.init();
  }

  async init(): Promise<void> {
    const [, status] = await Promise.all([
      this.userService.getCurrentUser().then(doc => (this.currentUserDoc = doc)),
      firstValueFrom(this.logicHandler.status$.pipe(filter(status => status === 'input' || status === 'abort')))
    ]);
    if (status === 'abort') {
      this.handleAbort();
      return;
    }
    this.initData = {
      projectId: await firstValueFrom(this.activatedProjectService.projectId$.pipe(filterNullish()))
    };

    this.initTrainingDataFiles(this.initData.projectId);

    const sources = this.logicHandler.sources;
    const targetTag = this.activatedProjectService.projectDoc?.data?.writingSystem.tag;
    const draftingSourceTag = sources?.draftingSources[0]?.writingSystem?.tag;
    if (targetTag != null && draftingSourceTag != null) {
      this.isTrainingOptional =
        (await this.nllbLanguageService.isNllbLanguageAsync(targetTag)) &&
        (await this.nllbLanguageService.isNllbLanguageAsync(draftingSourceTag));
    }

    const draftConfig = this.activatedProjectService.projectDoc?.data?.translateConfig?.draftConfig;
    this.sendEmailOnBuildFinished = draftConfig?.sendEmailOnBuildFinished ?? false;
    if (this.featureFlags.showDeveloperTools.enabled) {
      this.fastTraining = draftConfig?.fastTraining ?? false;
      this.useEcho = draftConfig?.useEcho ?? false;
    }

    if (this.onlineStatusService.isOnline) {
      await this.detectPendingUpdates();
    }
    if (this.pendingProjects.length > 0) {
      this.page = 'pending_updates';
    } else {
      // No pre-step, so we lock in immediately: start watching the involved projects for a sync.
      this.page = 'preface';
      this.armSyncWatcher();
    }

    // Watch for mid-flow aborts (e.g. config_changed) that occur after initialization completes.
    this.logicHandler.status$
      .pipe(
        filter(s => s === 'abort'),
        take(1),
        quietTakeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => this.handleAbort());
  }

  /**
   * Handles the logic handler entering its 'abort' state. An anticipated, explainable failure (no_access) shows a
   * blocking abort screen with a "Go back" action. Any other (unanticipated) failure is routed to the app-wide error
   * handler — which shows the standard error dialog and reports it — and the wizard navigates back to the
   * draft-generation page so the user isn't stranded on the loading spinner.
   */
  private handleAbort(): void {
    const mode = this.logicHandler.abortMode;
    if (mode === 'no_access' || mode === 'config_changed' || mode === 'project_syncing') {
      this.page = 'abort';
      return;
    }
    this.errorHandler.handleError(this.logicHandler.initError);
    this.goBack();
  }

  get abortMode(): NewDraftAbortMode {
    return this.logicHandler.abortMode;
  }

  get inaccessibleProjectNames(): string[] {
    return this.logicHandler.inaccessibleProjectNames;
  }

  goBack(): void {
    void this.router.navigate(['/projects', this.activatedProjectService.projectId, 'draft-generation']);
  }

  /**
   * Watches the project's training data files. The first time they load, the default selection is computed from the
   * previous build's selection and the files available at that time (see {@link defaultSelectedTrainingDataFiles}).
   * Later changes keep the displayed list current and drop any selected files that no longer exist, without clobbering
   * the user's in-session choices.
   */
  private initTrainingDataFiles(projectId: string): void {
    this.trainingDataService
      .getTrainingData(projectId, this.destroyRef)
      .pipe(quietTakeUntilDestroyed(this.destroyRef, { logWarnings: false }))
      .subscribe(files => {
        this.trainingDataFiles = files;
        const currentFileIds = files.map(f => f.dataId);
        if (!this.hasInitializedTrainingDataSelection) {
          const draftConfig = this.activatedProjectService.projectDoc?.data?.translateConfig?.draftConfig;
          this.selectedTrainingDataFileIds = new Set(
            defaultSelectedTrainingDataFiles(
              currentFileIds,
              draftConfig?.lastSelectedTrainingDataFiles,
              draftConfig?.lastAvailableTrainingDataFiles
            )
          );
          this.hasInitializedTrainingDataSelection = true;
        } else {
          // Prune selections for files that have since been removed.
          const stillPresent = new Set(currentFileIds);
          this.selectedTrainingDataFileIds = new Set(
            [...this.selectedTrainingDataFileIds].filter(id => stillPresent.has(id))
          );
        }
      });
  }

  isTrainingDataFileSelected(dataId: string): boolean {
    return this.selectedTrainingDataFileIds.has(dataId);
  }

  /** Titles of the training data files the user has selected, for the summary recap. */
  get selectedTrainingDataFileTitles(): string[] {
    return this.trainingDataFiles.filter(f => this.selectedTrainingDataFileIds.has(f.dataId)).map(f => f.title);
  }

  onTrainingDataFileToggled(dataId: string, selected: boolean): void {
    // Replace the Set so the template's change detection picks up the change.
    const updated = new Set(this.selectedTrainingDataFileIds);
    if (selected) {
      updated.add(dataId);
    } else {
      updated.delete(dataId);
    }
    this.selectedTrainingDataFileIds = updated;
  }

  private async detectPendingUpdates(): Promise<void> {
    const sources = this.logicHandler.sources;
    const projectId = this.initData!.projectId;
    const involvedIds = new Set([
      projectId,
      ...(sources?.draftingSources.map(s => s.projectRef) ?? []),
      ...(sources?.trainingSources.map(s => s.projectRef) ?? [])
    ]);

    let projects: ParatextProject[] | undefined;
    try {
      projects = await this.paratextService.getProjects();
    } catch (error) {
      // Detection is advisory — if we can't reach Paratext, proceed into the wizard rather than
      // stranding the user on the loading spinner. (Step 4's Generate is still offline/sync-gated.)
      this.errorReportingService.silentError(
        'Failed to check for pending Paratext updates before drafting',
        ErrorReportingService.normalizeError(error)
      );
      return;
    }
    this.pendingProjects = (projects ?? [])
      .filter(p => p.projectId != null && involvedIds.has(p.projectId) && p.isConnected && p.hasUpdate)
      .map(p => ({
        projectId: p.projectId!,
        name: p.name?.length ? p.name : p.shortName
      }));
  }

  /**
   * Handles leaving the pending-updates pre-step. If the user synced any projects in place, their data has changed, so
   * the wizard re-derives book/chapter availability from fresh progress (only the synced projects are re-fetched)
   * before showing Step 1 — otherwise the selection UI (offered books, "untranslated chapters" defaults, hints) would
   * reflect pre-sync state. With nothing synced there's nothing to refresh, so proceed straight to Step 1.
   */
  async onPendingUpdatesComplete(syncedProjectIds: string[]): Promise<void> {
    if (syncedProjectIds.length === 0) {
      this.page = 'preface';
      this.armSyncWatcher();
      return;
    }
    this.page = 'loading';
    try {
      await this.logicHandler.reload(syncedProjectIds);
      this.page = 'preface';
      this.armSyncWatcher();
    } catch (error) {
      // Mirror init-failure handling: route to the app-wide error handler and navigate back rather than stranding the
      // user on the spinner with stale data.
      this.errorHandler.handleError(error);
      this.goBack();
    }
  }

  private syncWatcherArmed = false;

  /**
   * Begins watching the projects involved in drafting (target + drafting/training sources) for a sync that *starts*
   * after this point, aborting the wizard if one does. Called at "lock-in" — when the user leaves the
   * pending-updates pre-step, or immediately when there was no pre-step. Before lock-in, syncs are expected and
   * absorbed by reloading; after it, a sync changes the progress/book data the user's in-progress selections are
   * based on, so we bail rather than draft against stale data. A project already syncing at lock-in is treated as the
   * baseline (no abort) — that only happens when the user continued past a pre-existing, possibly stuck, sync.
   */
  private armSyncWatcher(): void {
    if (this.syncWatcherArmed) return;
    this.syncWatcherArmed = true;

    const sources = this.logicHandler.sources;
    const involvedIds = new Set([
      this.initData!.projectId,
      ...(sources?.draftingSources.map(s => s.projectRef) ?? []),
      ...(sources?.trainingSources.map(s => s.projectRef) ?? [])
    ]);

    for (const projectId of involvedIds) {
      void this.watchProjectForSync(projectId);
    }
  }

  private async watchProjectForSync(projectId: string): Promise<void> {
    try {
      // The target is already loaded as the activated project; sources are fetched as profile docs (we have profile
      // access to all of them, since init aborts with no_access otherwise). Both carry the sync status.
      const projectDoc: SFProjectProfileDoc =
        projectId === this.initData?.projectId && this.activatedProjectService.projectDoc != null
          ? this.activatedProjectService.projectDoc
          : await this.projectService.getProfile(projectId);

      let wasSyncing = projectDoc.data != null && isSFProjectSyncing(projectDoc.data);
      projectDoc.remoteChanges$.pipe(quietTakeUntilDestroyed(this.destroyRef)).subscribe(() => {
        const data = projectDoc.data;
        if (data == null) return;
        const syncing = isSFProjectSyncing(data);
        // Abort only on the not-syncing → syncing edge; a project already syncing at arm time is the baseline.
        if (syncing && !wasSyncing) this.logicHandler.abort('project_syncing');
        wasSyncing = syncing;
      });
    } catch (error) {
      this.errorReportingService.silentError(
        'Failed to watch a project for sync during drafting',
        ErrorReportingService.normalizeError(error)
      );
    }
  }

  get currentUserEmail(): string | undefined {
    return this.currentUserDoc?.data?.email;
  }

  get copyrightMessages(): CopyrightMessage[] {
    const sources = this.logicHandler.sources;
    if (sources == null) return [];
    return (
      [...sources.trainingSources, ...sources.draftingSources]
        .map(s => ({ banner: s.copyrightBanner, notice: s.copyrightNotice }))
        .filter(s => s.banner != null)
        // deduplicate by banner text
        .filter((value, index, self) => index === self.findIndex(v => v.banner === value.banner)) as CopyrightMessage[]
    );
  }

  /** Index of the current page in PAGES_BY_ORDER, or -1 on non-step pages (loading, pending updates, abort). */
  private get currentPageIndex(): number {
    return PAGES_BY_ORDER.findIndex(p => p.page === this.page);
  }

  /** The 1-based number of the current wizard step, or null on non-step pages (loading, pending updates, abort). */
  get stepNumber(): number | null {
    const index = this.currentPageIndex;
    return index >= 0 ? index + 1 : null;
  }

  /** Total number of wizard steps shown in the step indicator. */
  get totalStepCount(): number {
    return PAGES_BY_ORDER.length;
  }

  back(): void {
    this.step(-1);
  }

  next(): void {
    this.step(1);
  }

  private getForwardError(): I18nKeyForComponent<'new_draft'> | null {
    if (this.page === 'draft_books') {
      if (this.logicHandler.selectedDraftingScriptureRange.books.size === 0) return 'no_drafting_books_selected';
      if (this.draftingChapterErrors.size > 0) return 'fix_chapter_errors';
    }
    if (this.page === 'training_books') {
      if (!this.isTrainingOptional && !this.hasTrainingBooksSelected) return 'no_training_books_selected';
      // Unlike the "select something" requirement above, an unpaired book is an inconsistent state, not a missing
      // optional choice: the user chose to train on a book but then deselected the matching reference book from every
      // source, so their selection leaves nothing to pair it with. Block it regardless of whether training is optional.
      if (this.unpairedTargetTrainingBooks.length > 0) return 'no_training_pair_selected';
      if (this.targetTrainingChapterErrors.size > 0) return 'fix_chapter_errors';
    }
    return null;
  }

  /**
   * Selected target training books with no matching book currently selected in any training source, so they can't form
   * a training pair. A target book is only offered when at least one source contains it, and selecting it auto-selects
   * it in each such source — so this is only non-empty after the user manually deselects that book from the source(s).
   */
  private get unpairedTargetTrainingBooks(): string[] {
    const targetBooks = Array.from(this.logicHandler.selectedTargetTrainingScriptureRange.books.keys());
    const selectedSourceBooks = new Set(Object.values(this.logicHandler.selectedTrainingSourceBooks).flat());
    return targetBooks.filter(bookId => !selectedSourceBooks.has(bookId));
  }

  private get hasTrainingBooksSelected(): boolean {
    // selectedTargetTrainingScriptureRange reflects the logic handler's view of what's actually available
    // for training (drafted chapters excluded), so it's the right thing to check — not just whether the
    // user clicked a book in the multi-select
    const hasTargetBooks = this.logicHandler.selectedTargetTrainingScriptureRange.books.size > 0;
    if (!hasTargetBooks) return false;
    if (this.trainingSources.length === 0) return true;
    const selected = this.logicHandler.selectedTrainingSourceBooks;
    return Object.values(selected).some(books => books.length > 0);
  }

  private clearStepErrorIfResolved(): void {
    if (this.stepError != null && this.getForwardError() !== this.stepError) this.stepError = null;
  }

  private step(count: 1 | -1): void {
    if (count === 1) {
      const error = this.getForwardError();
      if (error != null) {
        this.stepError = error;
        return;
      }
    }
    this.stepError = null;
    const newIndex = this.currentPageIndex + count;
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

  submitting = false;
  async generateDraftClicked(): Promise<void> {
    if (!this.onlineStatusService.isOnline || this.initData == null) return;

    this.submitting = true;

    await Promise.resolve();

    try {
      const projectId = this.initData.projectId;
      const draftingSource = this.logicHandler.sources?.draftingSources[0];
      if (draftingSource == null) return;

      const translationScriptureRanges: ProjectScriptureRange[] = [
        {
          projectId: draftingSource.projectRef,
          scriptureRange: this.logicHandler.selectedDraftingScriptureRange.toString()
        }
      ];

      const trainingScriptureRanges: ProjectScriptureRange[] = [];
      const selectedSrcBooks = this.logicHandler.selectedTrainingSourceBooks;
      for (const source of this.logicHandler.sources?.trainingSources ?? []) {
        const bookIds = selectedSrcBooks[source.projectRef] ?? [];
        if (bookIds.length > 0) {
          trainingScriptureRanges.push({ projectId: source.projectRef, scriptureRange: bookIds.join(';') });
        }
      }
      // Include target project entry at chapter-level: persists training selection and drives backend filter
      trainingScriptureRanges.push({
        projectId,
        scriptureRange: this.logicHandler.selectedTargetTrainingScriptureRange.toString()
      });

      // Report the files offered to the user (available) and the subset they chose (selected). Recording the
      // available set lets a later build tell newly added files apart from deliberately deselected ones.
      const availableTrainingDataFiles = this.trainingDataFiles.map(f => f.dataId);
      const trainingDataFiles = availableTrainingDataFiles.filter(id => this.selectedTrainingDataFileIds.has(id));

      const buildConfig: BuildConfig = {
        projectId,
        translationScriptureRanges,
        trainingScriptureRanges,
        trainingDataFiles,
        availableTrainingDataFiles,
        fastTraining: this.fastTraining,
        useEcho: this.useEcho,
        sendEmailOnBuildFinished: this.sendEmailOnBuildFinished
      };

      await firstValueFrom(this.draftGenerationService.startBuildOrGetActiveBuild(buildConfig));

      void this.router.navigate(['/projects', projectId, 'draft-generation']);
    } finally {
      this.submitting = false;
    }
  }

  /**
   * Maps a range's books to the `Book[]` shape the multi-select expects. With no `selectedBookIds`, every book is
   * marked selected (the range itself is the selection); otherwise a book is selected iff its id is in `selectedBookIds`.
   */
  private toBookList(range: VerboseScriptureRange, selectedBookIds?: Set<string>): Book[] {
    return scriptureRangeToBookListWithoutChapterDetail(range).map(id => ({
      number: Canon.bookIdToNumber(id),
      selected: selectedBookIds == null || selectedBookIds.has(id)
    }));
  }

  // Section: Drafting books selection

  get availableDraftingBooks(): Book[] {
    return this.toBookList(
      this.logicHandler.availableDraftingScriptureRange,
      new Set(this.logicHandler.selectedDraftingScriptureRange.books.keys())
    );
  }

  get selectedDraftingBooks(): Book[] {
    return this.toBookList(this.logicHandler.selectedDraftingScriptureRange);
  }

  get booksOfferedForPartialDrafting(): string[] {
    return this.logicHandler.booksOfferedForPartialDrafting;
  }

  /** Drafting-exclusion reasons shown to the user, in display order. Non-canonical exclusions are never surfaced. */
  private readonly surfacedDraftingExclusionReasons: DraftingBookExclusionReason[] = [
    'no_source_content',
    'not_in_target'
  ];

  /** How many books are hidden from the drafting list for a surfaced reason (used by the "N books are hidden" toggle). */
  get draftingHiddenBookCount(): number {
    return this.logicHandler.excludedDraftingBooks.filter(book =>
      this.surfacedDraftingExclusionReasons.includes(book.reason)
    ).length;
  }

  /**
   * Notices explaining books the user might expect that were left out of the drafting list, one per surfaced reason.
   * Non-canonical exclusions are intentionally tracked but not surfaced. Each entry carries the i18n key for its
   * reason and the parameters that message needs.
   */
  get draftingExclusionNotices(): { key: I18nKeyForComponent<'new_draft'>; params: Record<string, string> }[] {
    const excluded = this.logicHandler.excludedDraftingBooks;
    return this.surfacedDraftingExclusionReasons
      .map(reason => {
        const bookNames = excluded
          .filter(book => book.reason === reason)
          .map(book => this.i18n.localizeBook(book.bookId));
        return { reason, bookNames };
      })
      .filter(group => group.bookNames.length > 0)
      .map(group => ({
        key: `draft_books.excluded_${group.reason}` as I18nKeyForComponent<'new_draft'>,
        params: {
          books: this.i18n.enumerateList(group.bookNames),
          source: this.draftingSourceName,
          project: this.targetProjectDisplayName
        }
      }));
  }

  /** Drops chapter-input errors for books that are no longer offered for partial selection (so have no input). */
  private pruneChapterErrors(errors: Map<string, ChapterInputError>, offeredBookIds: string[]): void {
    for (const bookId of errors.keys()) {
      if (!offeredBookIds.includes(bookId)) errors.delete(bookId);
    }
  }

  onDraftingBookSelect(books: number[]): void {
    const selectedBookIds = books.map(b => Canon.bookNumberToId(b));
    this.logicHandler.selectDraftingBooks(selectedBookIds);
    this.pruneChapterErrors(this.draftingChapterErrors, this.logicHandler.booksOfferedForPartialDrafting);
    this.clearStepErrorIfResolved();
  }

  /**
   * Parses a chapter-range input, recording an error against `bookId` and returning null on failure. An empty (or
   * whitespace-only) input is rejected with `emptyErrorKey`: a still-selected book must have at least one chapter, so
   * an empty range is unreasonable input even though `ChapterSet('')` is a valid empty set. The empty message is
   * caller-specific because the resolution differs (deselect the book in the draft vs. training step) — clearing the
   * input is not how a book is removed.
   */
  private parseChapterInput(
    bookId: string,
    value: string,
    errors: Map<string, ChapterInputError>,
    emptyErrorKey: I18nKeyForComponent<'new_draft'>
  ): ChapterSet | null {
    if (value.trim() === '') {
      errors.set(bookId, { key: emptyErrorKey });
      return null;
    }
    try {
      return ChapterSet.fromUserInput(value);
    } catch {
      errors.set(bookId, { key: 'chapter_input.invalid_range' });
      return null;
    }
  }

  onDraftingChaptersBlurred(bookId: string, value: string): void {
    const parsed = this.parseChapterInput(bookId, value, this.draftingChapterErrors, 'chapter_input.empty_draft');
    if (parsed == null) return;

    const available = this.logicHandler.availableDraftingScriptureRange.books.get(bookId);
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
    const range = this.logicHandler.selectedDraftingScriptureRange;
    return range.books.get(bookId)?.toString() ?? '';
  }

  draftingChapterHint(bookId: string): string {
    return this.logicHandler.availableDraftingScriptureRange.books.get(bookId)?.toString() ?? '';
  }

  // Section: Target training books selection

  get availableTargetTrainingBooks(): Book[] {
    return this.toBookList(
      this.logicHandler.availableTargetTrainingScriptureRange,
      new Set(this.logicHandler.selectedTargetTrainingScriptureRange.books.keys())
    );
  }

  get selectedTargetTrainingBooks(): Book[] {
    return this.toBookList(this.logicHandler.selectedTargetTrainingScriptureRange);
  }

  get booksOfferedForPartialTargetTraining(): string[] {
    return this.logicHandler.booksOfferedForPartialTargetTraining;
  }

  /** Whether any target book is hidden from the training list for lacking a matching book in any training source. */
  get hasTargetTrainingBooksWithoutSource(): boolean {
    return this.logicHandler.targetTrainingBooksWithoutSource.length > 0;
  }

  /** How many target books are hidden from the training list (used by the "N books are hidden" toggle). */
  get targetTrainingHiddenBookCount(): number {
    return this.logicHandler.targetTrainingBooksWithoutSource.length;
  }

  /** Whether training books were pre-selected on this project's first draft (shows the "review these" notice). */
  get trainingBooksWereAutoSelected(): boolean {
    return this.logicHandler.trainingBooksWereAutoSelected;
  }

  /** Localized, comma-joined names of the target books hidden from the training list for lacking a training source. */
  get targetTrainingBooksWithoutSourceNames(): string {
    return this.i18n.enumerateList(
      this.logicHandler.targetTrainingBooksWithoutSource.map(bookId => this.i18n.localizeBook(bookId))
    );
  }

  onTargetTrainingBookSelect(books: number[]): void {
    const previousSelectedTargetIds = new Set(
      scriptureRangeToBookListWithoutChapterDetail(this.logicHandler.selectedTargetTrainingScriptureRange)
    );
    const newSelectedIds = new Set(books.map(n => Canon.bookNumberToId(n)));
    const addedIds = [...newSelectedIds].filter(id => !previousSelectedTargetIds.has(id));

    this.logicHandler.selectTargetTrainingBooks([...newSelectedIds]);
    this.pruneChapterErrors(this.targetTrainingChapterErrors, this.logicHandler.booksOfferedForPartialTargetTraining);

    // Auto-select newly added target books in each training source; drop removed books
    for (const source of this.trainingSources) {
      const available = this.logicHandler.availableTrainingSourceBooks[source.projectRef] ?? [];
      const currentSelected = this.logicHandler.selectedTrainingSourceBooks[source.projectRef] ?? [];
      const stillValid = currentSelected.filter(id => newSelectedIds.has(id));
      const autoAdded = addedIds.filter(id => available.includes(id));
      this.logicHandler.selectTrainingSourceBooks(source.projectRef, [...new Set([...stillValid, ...autoAdded])]);
    }
    this.logicHandler.dismissAutoSelectNoticeIfSelectionEmpty();
    this.clearStepErrorIfResolved();
  }

  onTargetTrainingChaptersBlurred(bookId: string, value: string): void {
    const parsed = this.parseChapterInput(
      bookId,
      value,
      this.targetTrainingChapterErrors,
      'chapter_input.empty_training'
    );
    if (parsed == null) return;

    const available = this.logicHandler.availableTargetTrainingScriptureRange.books.get(bookId);
    const unavailable = available != null ? parsed.difference(available) : parsed;

    if (unavailable.count() > 0) {
      const drafted = this.logicHandler.selectedDraftingScriptureRange.books.get(bookId);
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
    const range = this.logicHandler.selectedTargetTrainingScriptureRange;
    return range.books.get(bookId)?.toString() ?? '';
  }

  targetTrainingChapterHint(bookId: string): string {
    return this.logicHandler.availableTargetTrainingScriptureRange.books.get(bookId)?.toString() ?? '';
  }

  // Section: Training source book selection

  get trainingSources(): DraftSource[] {
    return this.logicHandler.sources?.trainingSources ?? [];
  }

  onTrainingSourceBookSelect(books: number[], projectId: string): void {
    const bookIds = books.map(b => Canon.bookNumberToId(b));
    this.logicHandler.selectTrainingSourceBooks(projectId, bookIds);
    this.clearStepErrorIfResolved();
  }

  availableTrainingSourceBooksForProject(projectId: string): Book[] {
    const bookIds = this.logicHandler.availableTrainingSourceBooks[projectId] ?? [];
    const selectedTargetIds = new Set(
      scriptureRangeToBookListWithoutChapterDetail(this.logicHandler.selectedTargetTrainingScriptureRange)
    );
    const selectedIds = this.logicHandler.selectedTrainingSourceBooks[projectId] ?? [];
    return bookIds
      .filter(id => selectedTargetIds.has(id))
      .map(id => ({ number: Canon.bookIdToNumber(id), selected: selectedIds.includes(id) }));
  }

  selectedTrainingSourceBooksForProject(projectId: string): Book[] {
    const bookIds = this.logicHandler.selectedTrainingSourceBooks[projectId] ?? [];
    return bookIds.map(id => ({ number: Canon.bookIdToNumber(id), selected: true }));
  }

  // Section: Summary (Step 4)

  get draftingItems(): { bookId: string; chapterRange: string | null }[] {
    const selectedRange = this.logicHandler.selectedDraftingScriptureRange;
    const availableRange = this.logicHandler.availableDraftingScriptureRange;
    return Array.from(selectedRange.books.entries())
      .sort(([a], [b]) => Canon.bookIdToNumber(a) - Canon.bookIdToNumber(b))
      .map(([bookId, selected]) => {
        const available = availableRange.books.get(bookId);
        const isPartial = available != null && available.difference(selected).count() > 0;
        return { bookId, chapterRange: isPartial ? formatChapterRange(selected.toString()) : null };
      });
  }

  /** Selected drafting book names with chapter ranges (for partially-drafted books), as bulleted-list items. */
  get draftingBookListItems(): string[] {
    return this.draftingItems.map(item => {
      const bookName = this.i18n.localizeBook(item.bookId);
      return item.chapterRange != null ? `${bookName} (${item.chapterRange})` : bookName;
    });
  }

  /** Selected drafting book names without chapter detail, as a locale-aware conjunction list (for the page title). */
  get draftingBookNamesFormatted(): string {
    // draftingItems is already canon-sorted, so reuse it rather than re-sorting the selected range here.
    return this.i18n.enumerateList(this.draftingItems.map(item => this.i18n.localizeBook(item.bookId)));
  }

  /** One row per training source that has selected books, for the summary's training-books table. */
  get sourceTrainingSections(): { projectRef: string; shortName: string; bookNumbers: number[] }[] {
    return this.trainingSources
      .map(source => {
        const bookIds = this.logicHandler.selectedTrainingSourceBooks[source.projectRef] ?? [];
        return {
          projectRef: source.projectRef,
          shortName: source.shortName,
          bookNumbers: bookIds.map(id => Canon.bookIdToNumber(id)).sort((a, b) => a - b)
        };
      })
      .filter(s => s.bookNumbers.length > 0);
  }

  /**
   * Localized training-book list for a source row in the summary table. Fully-used books collapse into ranges;
   * a book that is only partly used as training data is shown with its chapter range (and broken out of any range).
   */
  formatTrainingBooks(bookNumbers: number[]): string {
    return formatTrainingBooksSummary(
      bookNumbers,
      this.logicHandler.selectedTargetTrainingScriptureRange,
      this.logicHandler.availableTargetTrainingScriptureRange,
      this.logicHandler.selectedDraftingScriptureRange,
      this.i18n
    );
  }

  get draftingSourceName(): string {
    return this.logicHandler.sources?.draftingSources[0]?.shortName ?? '';
  }

  /** The drafting source's "shortName - name" label (shown in the draft-books summary subtitle). */
  get draftingSourceLabel(): string {
    const draftingSource = this.logicHandler.sources?.draftingSources[0];
    return draftingSource != null ? projectLabel(draftingSource) : '';
  }

  get sourceLanguageDisplay(): string {
    const tag = this.logicHandler.sources?.draftingSources[0]?.writingSystem?.tag;
    return tag != null ? this.languageDisplay(tag) : '';
  }

  get targetLanguageDisplay(): string {
    const tag = this.activatedProjectService.projectDoc?.data?.writingSystem?.tag;
    return tag != null ? this.languageDisplay(tag) : '';
  }

  private languageDisplay(tag: string): string {
    const name = this.i18n.getLanguageDisplayName(tag);
    return name === tag ? tag : `${name} (${tag})`;
  }

  get targetProjectDisplayName(): string {
    const projectData = this.activatedProjectService.projectDoc?.data;
    return projectData != null ? projectLabel(projectData) : '';
  }

  /** The target project's short name (the target column in the summary's training-books table). */
  get targetShortName(): string {
    return this.activatedProjectService.projectDoc?.data?.shortName ?? '';
  }

  /** Plain language name (no tag) for the training-source column header. Matches the legacy stepper's summary. */
  get sourceTrainingLanguageName(): string {
    const tag = this.trainingSources[0]?.writingSystem?.tag;
    return tag != null ? (this.i18n.getLanguageDisplayName(tag) ?? tag) : '';
  }

  /** Plain language name (no tag) for the target column header. */
  get targetLanguageName(): string {
    const tag = this.activatedProjectService.projectDoc?.data?.writingSystem?.tag;
    return tag != null ? (this.i18n.getLanguageDisplayName(tag) ?? tag) : '';
  }

  /** Whether an administrator has applied a custom Serval config to this project (shown as a notice on the summary). */
  get isCustomConfigSet(): boolean {
    return this.activatedProjectService.projectDoc?.data?.translateConfig?.draftConfig?.servalConfig != null;
  }

  goToConfigureSources(): void {
    const projectId = this.initData?.projectId;
    if (projectId != null) {
      void this.router.navigate(['/projects', projectId, 'draft-generation', 'configure-sources']);
    }
  }

  goToPage(page: 'draft_books' | 'training_books'): void {
    this.stepError = null;
    if (page === 'draft_books') {
      this.logicHandler.setInputMode('draft_books');
    }
    this.page = page;
  }
}
