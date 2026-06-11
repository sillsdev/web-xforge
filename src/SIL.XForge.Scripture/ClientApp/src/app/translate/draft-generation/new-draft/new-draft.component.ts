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
import { DevOnlyComponent } from 'src/app/shared/dev-only/dev-only.component';
import { JsonViewerComponent } from 'src/app/shared/json-viewer/json-viewer.component';
import { ErrorReportingService } from 'xforge-common/error-reporting.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { hasStringProp } from '../../../../type-utils';
import { ActivatedProjectService } from '../../../../xforge-common/activated-project.service';
import { FeatureFlagService } from '../../../../xforge-common/feature-flags/feature-flag.service';
import { I18nKeyForComponent, I18nService } from '../../../../xforge-common/i18n.service';
import { UserDoc } from '../../../../xforge-common/models/user-doc';
import { UserService } from '../../../../xforge-common/user.service';
import { filterNullish, quietTakeUntilDestroyed } from '../../../../xforge-common/util/rxjs-util';
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
import { defaultSelectedTrainingDataFiles } from './training-data-file-selection';
import { ParatextProject } from '../../../core/models/paratext-project';
import { ParatextService } from '../../../core/paratext.service';
import {
  DraftingBookExclusionReason,
  DraftProgressService,
  NewDraftAbortMode,
  NewDraftLogicHandler,
  scriptureRangeToBookListWithoutChapterDetail
} from './new-draft-logic-handler';
import { ChapterSet, VerboseScriptureRange } from './scripture-range';
import { DraftPendingUpdatesComponent } from './draft-pending-updates/draft-pending-updates.component';

interface CopyrightMessage {
  banner: string;
  notice?: string;
}

interface ChapterInputError {
  key: I18nKeyForComponent<'new_draft'>;
  params?: object;
}

type TargetTrainingItem = { kind: 'book'; bookId: string; chapterRange: string } | { kind: 'range'; label: string };

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
    JsonViewerComponent,
    BookMultiSelectComponent,
    MatFormFieldModule,
    MatInputModule,
    NoticeComponent,
    DevOnlyComponent,
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
    this.page = this.pendingProjects.length > 0 ? 'pending_updates' : 'preface';

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
    const mode = this.logicHandler.abortMode$.getValue();
    if (mode === 'no_access' || mode === 'config_changed') {
      this.page = 'abort';
      return;
    }
    this.errorHandler.handleError(this.logicHandler.initError);
    this.goBack();
  }

  get abortMode(): NewDraftAbortMode {
    return this.logicHandler.abortMode$.getValue();
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

  back(): void {
    this.step(-1);
  }

  next(): void {
    this.step(1);
  }

  private getForwardError(): I18nKeyForComponent<'new_draft'> | null {
    if (this.page === 'draft_books') {
      if (this.logicHandler.selectedDraftingScriptureRange$.getValue().books.size === 0)
        return 'no_drafting_books_selected';
      if (this.draftingChapterErrors.size > 0) return 'fix_chapter_errors';
    }
    if (this.page === 'training_books') {
      if (!this.isTrainingOptional && !this.hasTrainingBooksSelected) return 'no_training_books_selected';
      if (this.targetTrainingChapterErrors.size > 0) return 'fix_chapter_errors';
    }
    return null;
  }

  private get hasTrainingBooksSelected(): boolean {
    // selectedTargetTrainingScriptureRange reflects the logic handler's view of what's actually available
    // for training (drafted chapters excluded), so it's the right thing to check — not just whether the
    // user clicked a book in the multi-select
    const hasTargetBooks = this.logicHandler.selectedTargetTrainingScriptureRange$.getValue().books.size > 0;
    if (!hasTargetBooks) return false;
    if (this.trainingSources.length === 0) return true;
    const selected = this.logicHandler.selectedTrainingSourceBooks$.getValue();
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
          scriptureRange: this.logicHandler.selectedDraftingScriptureRange$.getValue().toString()
        }
      ];

      const trainingScriptureRanges: ProjectScriptureRange[] = [];
      const selectedSrcBooks = this.logicHandler.selectedTrainingSourceBooks$.getValue();
      for (const source of this.logicHandler.sources?.trainingSources ?? []) {
        const bookIds = selectedSrcBooks[source.projectRef] ?? [];
        if (bookIds.length > 0) {
          trainingScriptureRanges.push({ projectId: source.projectRef, scriptureRange: bookIds.join(';') });
        }
      }
      // Include target project entry at chapter-level: persists training selection and drives backend filter
      trainingScriptureRanges.push({
        projectId,
        scriptureRange: this.logicHandler.selectedTargetTrainingScriptureRange$.getValue().toString()
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

  /**
   * Maps a range's books to the `Book[]` shape the multi-select expects. With no `selectedIds`, every book is marked
   * selected (the range itself is the selection); otherwise a book is selected iff its number is in `selectedIds`.
   */
  private toBookList(range: VerboseScriptureRange, selectedIds?: Set<number>): Book[] {
    return scriptureRangeToBookListWithoutChapterDetail(range).map(id => {
      const number = Canon.bookIdToNumber(id);
      return { number, selected: selectedIds == null || selectedIds.has(number) };
    });
  }

  private bookNumbersOf(range: VerboseScriptureRange): Set<number> {
    return new Set(scriptureRangeToBookListWithoutChapterDetail(range).map(id => Canon.bookIdToNumber(id)));
  }

  // Section: Drafting books selection

  get availableDraftingBooks(): Book[] {
    return this.toBookList(
      this.logicHandler.availableDraftingScriptureRange$.getValue(),
      this.bookNumbersOf(this.logicHandler.selectedDraftingScriptureRange$.getValue())
    );
  }

  get selectedDraftingBooks(): Book[] {
    return this.toBookList(this.logicHandler.selectedDraftingScriptureRange$.getValue());
  }

  get booksOfferedForPartialDrafting(): string[] {
    return this.logicHandler.booksOfferedForPartialDrafting$.getValue();
  }

  /**
   * Notices explaining books the user might expect that were left out of the drafting list, one per surfaced reason.
   * Non-canonical exclusions are intentionally tracked but not surfaced. Each entry carries the i18n key for its
   * reason and the parameters that message needs.
   */
  get draftingExclusionNotices(): { key: I18nKeyForComponent<'new_draft'>; params: Record<string, string> }[] {
    // Reasons shown to the user, in display order. Books excluded only for being non-canonical are omitted.
    const surfacedReasons: DraftingBookExclusionReason[] = ['no_source_content', 'not_in_target'];
    const excluded = this.logicHandler.excludedDraftingBooks$.getValue();
    return surfacedReasons
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

  onDraftingBookSelect(books: number[]): void {
    const selectedBookIds = books.map(b => Canon.bookNumberToId(b));
    this.logicHandler.selectDraftingBooks(selectedBookIds);
    for (const bookId of this.draftingChapterErrors.keys()) {
      if (!this.logicHandler.booksOfferedForPartialDrafting$.getValue().includes(bookId)) {
        this.draftingChapterErrors.delete(bookId);
      }
    }
    this.clearStepErrorIfResolved();
  }

  /** Parses a chapter-range input, recording an invalid_range error against `bookId` and returning null on failure. */
  private parseChapterInput(bookId: string, value: string, errors: Map<string, ChapterInputError>): ChapterSet | null {
    try {
      return new ChapterSet(value);
    } catch {
      errors.set(bookId, { key: 'chapter_input.invalid_range' });
      return null;
    }
  }

  onDraftingChaptersBlurred(bookId: string, value: string): void {
    const parsed = this.parseChapterInput(bookId, value, this.draftingChapterErrors);
    if (parsed == null) return;

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
    return this.toBookList(
      this.logicHandler.availableTargetTrainingScriptureRange$.getValue(),
      this.bookNumbersOf(this.logicHandler.selectedTargetTrainingScriptureRange$.getValue())
    );
  }

  get selectedTargetTrainingBooks(): Book[] {
    return this.toBookList(this.logicHandler.selectedTargetTrainingScriptureRange$.getValue());
  }

  get booksOfferedForPartialTargetTraining(): string[] {
    return this.logicHandler.booksOfferedForPartialTargetTraining$.getValue();
  }

  /** Whether any target book is hidden from the training list for lacking a matching book in any training source. */
  get hasTargetTrainingBooksWithoutSource(): boolean {
    return this.logicHandler.targetTrainingBooksWithoutSource$.getValue().length > 0;
  }

  /** Localized, comma-joined names of the target books hidden from the training list for lacking a training source. */
  get targetTrainingBooksWithoutSourceNames(): string {
    return this.i18n.enumerateList(
      this.logicHandler.targetTrainingBooksWithoutSource$.getValue().map(bookId => this.i18n.localizeBook(bookId))
    );
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
    this.clearStepErrorIfResolved();
  }

  onTargetTrainingChaptersBlurred(bookId: string, value: string): void {
    const parsed = this.parseChapterInput(bookId, value, this.targetTrainingChapterErrors);
    if (parsed == null) return;

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
    this.clearStepErrorIfResolved();
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

  // Section: Summary (Step 4)

  get draftingItems(): { bookId: string; chapterRange: string | null }[] {
    const selectedRange = this.logicHandler.selectedDraftingScriptureRange$.getValue();
    const availableRange = this.logicHandler.availableDraftingScriptureRange$.getValue();
    return Array.from(selectedRange.books.entries())
      .sort(([a], [b]) => Canon.bookIdToNumber(a) - Canon.bookIdToNumber(b))
      .map(([bookId, selected]) => {
        const available = availableRange.books.get(bookId);
        const isPartial = available != null && available.difference(selected).count() > 0;
        return { bookId, chapterRange: isPartial ? formatChapterRange(selected.toString()) : null };
      });
  }

  get draftingItemsFormatted(): { type: 'element' | 'literal'; value: string }[] {
    const items = this.draftingItems.map(item => {
      const bookName = this.i18n.localizeBook(item.bookId);
      return item.chapterRange ? `${bookName} (${item.chapterRange})` : bookName;
    });
    return this.i18n.enumerateListParts(items);
  }

  get draftHeadingParts(): { text: string; id?: string }[] {
    return this.i18n.interpolateVariables('new_draft.summary.draft_heading');
  }

  /** Returns items for the "Your translation" training section in canonical order.
   * Consecutive full-book selections are collapsed into a single range label. */
  get targetTrainingItems(): TargetTrainingItem[] {
    const selectedRange = this.logicHandler.selectedTargetTrainingScriptureRange$.getValue();
    const availableRange = this.logicHandler.availableTargetTrainingScriptureRange$.getValue();
    const result: TargetTrainingItem[] = [];
    let pendingBookNumbers: number[] = [];

    const flushPending = (): void => {
      if (pendingBookNumbers.length > 0) {
        result.push({ kind: 'range', label: this.i18n.formatAndLocalizeBookRange(pendingBookNumbers) });
        pendingBookNumbers = [];
      }
    };

    const sortedEntries = Array.from(selectedRange.books.entries()).sort(
      ([a], [b]) => Canon.bookIdToNumber(a) - Canon.bookIdToNumber(b)
    );
    for (const [bookId, selected] of sortedEntries) {
      const available = availableRange.books.get(bookId);
      const isPartial = available != null && available.difference(selected).count() > 0;
      if (isPartial) {
        flushPending();
        result.push({ kind: 'book', bookId, chapterRange: formatChapterRange(selected.toString()) });
      } else {
        pendingBookNumbers.push(Canon.bookIdToNumber(bookId));
      }
    }
    flushPending();
    return result;
  }

  get sourceTrainingSections(): { projectRef: string; displayName: string; bookNumbers: number[] }[] {
    return this.trainingSources
      .map(source => {
        const bookIds = this.logicHandler.selectedTrainingSourceBooks$.getValue()[source.projectRef] ?? [];
        return {
          projectRef: source.projectRef,
          displayName: projectLabel(source),
          bookNumbers: bookIds.map(id => Canon.bookIdToNumber(id)).sort((a, b) => a - b)
        };
      })
      .filter(s => s.bookNumbers.length > 0);
  }

  get draftingSourceName(): string {
    return this.logicHandler.sources?.draftingSources[0]?.shortName ?? '';
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

  get targetTrainingFormattedDisplay(): string {
    return this.targetTrainingItems
      .map(item =>
        item.kind === 'book' ? `${this.i18n.localizeBook(item.bookId)} (ch. ${item.chapterRange})` : item.label
      )
      .join(', ');
  }

  get hasNoTrainingData(): boolean {
    return this.logicHandler.selectedTargetTrainingScriptureRange$.getValue().books.size === 0;
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
