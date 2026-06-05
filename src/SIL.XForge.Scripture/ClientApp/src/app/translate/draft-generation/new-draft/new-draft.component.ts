import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
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
import { ProjectScriptureRange } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { filter, firstValueFrom } from 'rxjs';
import { DevOnlyComponent } from 'src/app/shared/dev-only/dev-only.component';
import { JsonViewerComponent } from 'src/app/shared/json-viewer/json-viewer.component';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { hasStringProp } from '../../../../type-utils';
import { ActivatedProjectService } from '../../../../xforge-common/activated-project.service';
import { FeatureFlagService } from '../../../../xforge-common/feature-flags/feature-flag.service';
import { I18nKeyForComponent, I18nService } from '../../../../xforge-common/i18n.service';
import { UserDoc } from '../../../../xforge-common/models/user-doc';
import { UserService } from '../../../../xforge-common/user.service';
import { filterNullish } from '../../../../xforge-common/util/rxjs-util';
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
import { ParatextService } from '../../../core/paratext.service';
import {
  DraftProgressService,
  NewDraftLogicHandler,
  scriptureRangeToBookListWithoutChapterDetail
} from './new-draft-logic-handler';
import { ChapterSet } from './scripture-range';
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

  page: (typeof PAGES_BY_ORDER)[number]['page'] | 'loading' | 'pending_updates' = 'loading';

  pendingProjects: { projectId: string; name: string }[] = [];

  draftingChapterErrors = new Map<string, ChapterInputError>();
  targetTrainingChapterErrors = new Map<string, ChapterInputError>();
  stepError: I18nKeyForComponent<'new_draft'> | null = null;

  sendEmailOnBuildFinished: boolean = false;
  fastTraining: boolean = false;
  useEcho: boolean = false;
  isTrainingOptional: boolean = false;

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
    private readonly paratextService: ParatextService
  ) {
    this.logicHandler = new NewDraftLogicHandler(
      this.activatedProjectService,
      this.draftSourcesService,
      this.progressService
    );

    void this.init();
  }

  async init(): Promise<void> {
    [this.currentUserDoc] = await Promise.all([
      this.userService.getCurrentUser(),
      firstValueFrom(this.logicHandler.status$.pipe(filter(status => status === 'input')))
    ]);
    this.initData = {
      projectId: await firstValueFrom(this.activatedProjectService.projectId$.pipe(filterNullish()))
    };

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
  }

  private async detectPendingUpdates(): Promise<void> {
    const sources = this.logicHandler.sources;
    const projectId = this.initData!.projectId;
    const involvedIds = new Set([
      projectId,
      ...(sources?.draftingSources.map(s => s.projectRef) ?? []),
      ...(sources?.trainingSources.map(s => s.projectRef) ?? [])
    ]);

    const projects = await this.paratextService.getProjects();
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

      const trainingDataFiles =
        this.activatedProjectService.projectDoc?.data?.translateConfig.draftConfig.lastSelectedTrainingDataFiles ?? [];

      const buildConfig: BuildConfig = {
        projectId,
        translationScriptureRanges,
        trainingScriptureRanges,
        trainingDataFiles,
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
    this.clearStepErrorIfResolved();
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
    this.clearStepErrorIfResolved();
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
