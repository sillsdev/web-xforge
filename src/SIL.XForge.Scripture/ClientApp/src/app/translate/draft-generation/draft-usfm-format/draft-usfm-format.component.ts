import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, DestroyRef, EventEmitter, ViewChild } from '@angular/core';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { Router } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { Delta } from 'quill';
import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import {
  DraftUsfmConfig,
  ParagraphBreakFormat,
  QuoteFormat
} from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { combineLatest, first, Subject, switchMap } from 'rxjs';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nService } from 'xforge-common/i18n.service';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { TextDocId } from '../../../core/models/text-doc';
import { SFProjectService } from '../../../core/sf-project.service';
import { ServalAdministrationService } from '../../../serval-administration/serval-administration.service';
import { ConfirmOnLeave } from '../../../shared/project-router.guard';
import { SharedModule } from '../../../shared/shared.module';
import { TextComponent } from '../../../shared/text/text.component';
import { DraftHandlingService } from '../draft-handling.service';

@Component({
  selector: 'app-draft-usfm-format',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    SharedModule,
    TranslocoModule,
    MatFormFieldModule,
    MatRadioModule
  ],
  templateUrl: './draft-usfm-format.component.html',
  styleUrl: './draft-usfm-format.component.scss'
})
export class DraftUsfmFormatComponent extends DataLoadingComponent implements AfterViewInit, ConfirmOnLeave {
  @ViewChild(TextComponent) draftText!: TextComponent;
  bookNum: number = 1;
  booksWithDrafts: number[] = [];
  chapterNum: number = 1;
  chapters: number[] = [];
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

  constructor(
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly draftHandlingService: DraftHandlingService,
    private readonly projectService: SFProjectService,
    private readonly onlineStatusService: OnlineStatusService,
    private readonly servalAdministration: ServalAdministrationService,
    private readonly dialogService: DialogService,
    readonly noticeService: NoticeService,
    readonly i18n: I18nService,
    private readonly router: Router,
    private destroyRef: DestroyRef
  ) {
    super(noticeService);
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

  private get currentFormat(): DraftUsfmConfig | undefined {
    const paragraphFormat = this.paragraphFormat.value;
    const quoteFormat = this.quoteFormat.value;
    // both values must be set to be valid
    if (paragraphFormat == null || quoteFormat == null) return undefined;
    return { paragraphFormat, quoteFormat };
  }

  ngAfterViewInit(): void {
    combineLatest([this.activatedProjectService.projectDoc$, this.draftText.editorCreated as EventEmitter<void>])
      .pipe(first(), quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(([projectDoc]) => {
        if (projectDoc?.data == null) return;
        this.setUsfmConfig(projectDoc.data.translateConfig.draftConfig.usfmConfig);
        const texts: TextInfo[] = projectDoc.data.texts;
        this.booksWithDrafts = texts.filter(t => t.chapters.some(c => c.hasDraft)).map(t => t.bookNum);

        if (this.booksWithDrafts.length === 0) return;
        this.loadingStarted();
        this.bookChanged(this.booksWithDrafts[0]);
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

  bookChanged(bookNum: number): void {
    this.bookNum = bookNum;
    const texts = this.activatedProjectService.projectDoc!.data!.texts;
    this.chapters = texts.find(t => t.bookNum === this.bookNum)?.chapters.map(c => c.number) ?? [];
    this.chapterNum = this.chapters[0] ?? 1;
    this.reloadText();
  }

  chapterChanged(chapterNum: number): void {
    this.chapterNum = chapterNum;
    this.reloadText();
  }

  close(): void {
    this.router.navigate(['projects', this.projectId, 'draft-generation']);
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
      this.router.navigate(['projects', this.projectId, 'draft-generation']);
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
}
