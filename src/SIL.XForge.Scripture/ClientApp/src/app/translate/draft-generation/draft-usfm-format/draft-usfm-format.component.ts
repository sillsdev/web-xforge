import { Location } from '@angular/common';
import { AfterViewInit, Component, DestroyRef, EventEmitter, ViewChild } from '@angular/core';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatCard, MatCardContent, MatCardHeader, MatCardTitle } from '@angular/material/card';
import { MatIcon } from '@angular/material/icon';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatRadioButton, MatRadioGroup } from '@angular/material/radio';
import { ActivatedRoute } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { Canon } from '@sillsdev/scripture';
import { Delta } from 'quill';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import {
  DraftUsfmConfig,
  ParagraphBreakFormat,
  QuoteFormat
} from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { combineLatest, first, firstValueFrom, Subject, switchMap } from 'rxjs';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nService } from 'xforge-common/i18n.service';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { filterNullish, quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { TextDocId } from '../../../core/models/text-doc';
import { SFProjectService } from '../../../core/sf-project.service';
import { QuotationAnalysis } from '../../../machine-api/quotation-denormalization';
import { ServalAdministrationService } from '../../../serval-administration/serval-administration.service';
import { BookChapterChooserComponent } from '../../../shared/book-chapter-chooser/book-chapter-chooser.component';
import { NoticeComponent } from '../../../shared/notice/notice.component';
import { ConfirmOnLeave } from '../../../shared/project-router.guard';
import { TextComponent } from '../../../shared/text/text.component';
import { DraftGenerationService } from '../draft-generation.service';
import { DraftHandlingService } from '../draft-handling.service';

@Component({
  selector: 'app-draft-usfm-format',
  imports: [
    MatButton,
    MatCard,
    MatCardHeader,
    MatCardContent,
    MatCardTitle,
    MatIcon,
    MatProgressSpinner,
    FormsModule,
    ReactiveFormsModule,
    BookChapterChooserComponent,
    NoticeComponent,
    TextComponent,
    TranslocoModule,
    MatRadioGroup,
    MatRadioButton
  ],
  templateUrl: './draft-usfm-format.component.html',
  styleUrl: './draft-usfm-format.component.scss'
})
export class DraftUsfmFormatComponent extends DataLoadingComponent implements AfterViewInit, ConfirmOnLeave {
  @ViewChild(TextComponent) draftText!: TextComponent;
  bookNum: number = 1;
  booksWithDrafts: number[] = [];
  chapterNum: number = 1;
  chaptersWithDrafts: number[] = [];
  isInitializing: boolean = true;
  paragraphBreakFormat = ParagraphBreakFormat;
  quoteStyle = QuoteFormat;

  paragraphFormat = new FormControl<ParagraphBreakFormat>(ParagraphBreakFormat.BestGuess);
  quoteFormat = new FormControl<QuoteFormat>(QuoteFormat.Denormalized);
  usfmFormatForm: FormGroup = new FormGroup({
    paragraphFormat: this.paragraphFormat,
    quoteFormat: this.quoteFormat
  });

  protected saving = false;

  private updateDraftConfig$: Subject<DraftUsfmConfig | undefined> = new Subject<DraftUsfmConfig | undefined>();
  private lastSavedState?: DraftUsfmConfig;
  private quotationDenormalization: QuotationAnalysis = QuotationAnalysis.Successful;

  constructor(
    private readonly activatedRoute: ActivatedRoute,
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly draftHandlingService: DraftHandlingService,
    private readonly draftGenerationService: DraftGenerationService,
    private readonly projectService: SFProjectService,
    private readonly onlineStatusService: OnlineStatusService,
    private readonly servalAdministration: ServalAdministrationService,
    private readonly dialogService: DialogService,
    readonly noticeService: NoticeService,
    readonly i18n: I18nService,
    private readonly location: Location,
    private destroyRef: DestroyRef
  ) {
    super(noticeService);
    this.activatedProjectService.projectId$
      .pipe(filterNullish(), first(), quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(async projectId => {
        const currentBuild = await firstValueFrom(this.draftGenerationService.getLastCompletedBuild(projectId));
        this.quotationDenormalization =
          currentBuild?.additionalInfo?.quotationDenormalization === QuotationAnalysis.Successful
            ? QuotationAnalysis.Successful
            : QuotationAnalysis.Unsuccessful;
      });
  }

  get projectId(): string | undefined {
    return this.activatedProjectService.projectId;
  }

  get isRightToLeft(): boolean {
    return !!this.activatedProjectService.projectDoc?.data?.isRightToLeft;
  }

  get textDocId(): TextDocId | undefined {
    if (this.projectId == null) return undefined;
    return new TextDocId(this.projectId, this.bookNum, this.chapterNum);
  }

  get isOnline(): boolean {
    return this.onlineStatusService.isOnline;
  }

  get showQuoteFormatWarning(): boolean {
    return this.quotationDenormalization !== QuotationAnalysis.Successful;
  }

  private get currentFormat(): DraftUsfmConfig | undefined {
    const paragraphFormat = this.paragraphFormat.value;
    const quoteFormat = this.quoteFormat.value;
    // both values must be set to be valid
    if (paragraphFormat == null || quoteFormat == null) return undefined;
    return { paragraphFormat, quoteFormat };
  }

  ngAfterViewInit(): void {
    combineLatest([this.activatedRoute.params, this.draftText.editorCreated as EventEmitter<void>])
      .pipe(first(), quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(([params]) => {
        const projectDoc = this.activatedProjectService.projectDoc;
        if (projectDoc?.data == null) return;
        this.setUsfmConfig(projectDoc.data.translateConfig.draftConfig.usfmConfig);
        const texts: TextInfo[] = projectDoc.data.texts;
        this.booksWithDrafts = texts.filter(t => t.chapters.some(c => c.hasDraft)).map(t => t.bookNum);

        if (this.booksWithDrafts.length === 0) return;
        this.loadingStarted();

        let defaultBook = this.booksWithDrafts[0];
        if (params['bookId'] !== undefined && this.booksWithDrafts.includes(Canon.bookIdToNumber(params['bookId']))) {
          defaultBook = Canon.bookIdToNumber(params['bookId']);
        }
        let defaultChapter = 1;
        this.chaptersWithDrafts = this.getChaptersWithDrafts(defaultBook, projectDoc.data);
        if (params['chapter'] !== undefined && this.chaptersWithDrafts.includes(Number(params['chapter']))) {
          defaultChapter = Number(params['chapter']);
        } else if (this.chaptersWithDrafts.length > 0) {
          defaultChapter = this.chaptersWithDrafts[0];
        }
        this.bookChanged(defaultBook, defaultChapter);
      });

    this.updateDraftConfig$
      .pipe(
        quietTakeUntilDestroyed(this.destroyRef),
        switchMap(config => this.draftHandlingService.getDraft(this.textDocId!, { isDraftLegacy: false, config }))
      )
      .subscribe(ops => {
        const draftDelta: Delta = new Delta(this.draftHandlingService.draftDataToOps(ops, []));
        this.draftText.setContents(draftDelta, 'api');
        this.draftText.applyEditorStyles();
        this.isInitializing = false;
        this.loadingFinished();
      });

    this.onlineStatusService.onlineStatus$.pipe(quietTakeUntilDestroyed(this.destroyRef)).subscribe(isOnline => {
      if (isOnline) {
        this.usfmFormatForm.enable();
      } else {
        this.usfmFormatForm.disable();
      }
    });
  }

  bookChanged(bookNum: number, chapterNum?: number): void {
    this.bookNum = bookNum;
    this.chaptersWithDrafts = this.getChaptersWithDrafts(bookNum, this.activatedProjectService.projectDoc!.data!);
    this.chapterNum = chapterNum ?? this.chaptersWithDrafts[0] ?? 1;
    this.reloadText();
  }

  chapterChanged(chapterNum: number): void {
    this.chapterNum = chapterNum;
    this.reloadText();
  }

  close(): void {
    this.location.back();
  }

  reloadText(): void {
    this.loadingStarted();
    this.updateDraftConfig$.next(this.currentFormat);
  }

  async saveChanges(): Promise<void> {
    if (this.projectId == null || !this.isOnline || this.currentFormat == null) return;

    try {
      this.saving = true;
      await this.projectService.onlineSetUsfmConfig(this.projectId, this.currentFormat);
      this.lastSavedState = this.currentFormat;
      // The user is redirected to the draft generation page if the format is saved.
      await this.servalAdministration.onlineRetrievePreTranslationStatus(this.projectId);
      this.close();
    } catch (err) {
      console.error('Error occurred while saving draft format', err);
      this.noticeService.showError(this.i18n.translateStatic('draft_usfm_format.failed_to_save'));
    } finally {
      this.saving = false;
    }
  }

  async confirmLeave(): Promise<boolean> {
    if (
      this.lastSavedState?.paragraphFormat === this.currentFormat?.paragraphFormat &&
      this.lastSavedState?.quoteFormat === this.currentFormat?.quoteFormat
    ) {
      return true;
    }
    return this.dialogService.confirm(
      this.i18n.translate('draft_sources.discard_changes_confirmation'),
      this.i18n.translate('draft_sources.leave_and_discard'),
      this.i18n.translate('draft_sources.stay_on_page')
    );
  }

  private setUsfmConfig(config?: DraftUsfmConfig): void {
    this.usfmFormatForm.setValue({
      paragraphFormat: config?.paragraphFormat ?? ParagraphBreakFormat.BestGuess,
      quoteFormat: config?.quoteFormat ?? QuoteFormat.Denormalized
    });
    this.lastSavedState = this.currentFormat;

    this.usfmFormatForm.valueChanges
      .pipe(
        switchMap(() => this.onlineStatusService.onlineStatus$),
        quietTakeUntilDestroyed(this.destroyRef)
      )
      .subscribe(isOnline => {
        if (isOnline) this.reloadText();
      });
  }

  private getChaptersWithDrafts(bookNum: number, project: SFProjectProfile): number[] {
    return (
      project.texts
        .find(t => t.bookNum === bookNum)
        ?.chapters.filter(c => !!c.hasDraft && c.lastVerse > 0)
        .map(c => c.number) ?? []
    );
  }
}
