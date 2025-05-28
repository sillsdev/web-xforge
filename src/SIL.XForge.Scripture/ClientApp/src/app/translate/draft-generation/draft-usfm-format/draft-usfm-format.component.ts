import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, DestroyRef, EventEmitter, ViewChild } from '@angular/core';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { translate, TranslocoModule } from '@ngneat/transloco';
import { Delta } from 'quill';
import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { DraftUsfmConfig } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
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
  standalone: true,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatIconModule,
    MatProgressSpinnerModule,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    SharedModule,
    TranslocoModule
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

  usfmFormatForm: FormGroup = new FormGroup({
    preserveParagraphs: new FormControl()
  });

  private updateDraftConfig$: Subject<DraftUsfmConfig> = new Subject<DraftUsfmConfig>();
  private initialParagraphState?: boolean;

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

  private get currentUsfmFormatConfig(): DraftUsfmConfig {
    return {
      preserveParagraphMarkers: this.usfmFormatForm.controls.preserveParagraphs.value
    };
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
    this.updateDraftConfig$.next(this.currentUsfmFormatConfig);
  }

  async saveChanges(): Promise<void> {
    if (this.projectId == null || !this.isOnline) return;

    try {
      await this.projectService.onlineSetUsfmConfig(this.projectId, this.currentUsfmFormatConfig);
      // not awaited so that the user is directed to the draft generation page
      this.servalAdministration.onlineRetrievePreTranslationStatus(this.projectId).then(() => {
        this.noticeService.show(translate('draft_usfm_format.changes_have_been_saved'));
      });
    } catch {
      this.noticeService.showError(translate('draft_usfm-format.failed_to_save'));
    }
  }

  async confirmLeave(): Promise<boolean> {
    if (this.initialParagraphState === this.currentUsfmFormatConfig.preserveParagraphMarkers) return true;
    return this.dialogService.confirm(
      this.i18n.translate('draft_sources.discard_changes_confirmation'),
      this.i18n.translate('draft_sources.leave_and_discard'),
      this.i18n.translate('draft_sources.stay_on_page')
    );
  }

  private setUsfmConfig(config?: DraftUsfmConfig): void {
    config ??= {
      preserveParagraphMarkers: true
    };

    this.usfmFormatForm.setValue({
      preserveParagraphs: config.preserveParagraphMarkers
    });
    this.initialParagraphState = config.preserveParagraphMarkers;

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
