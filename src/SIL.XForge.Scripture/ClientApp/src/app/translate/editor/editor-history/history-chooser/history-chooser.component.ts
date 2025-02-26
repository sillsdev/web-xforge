import { AfterViewInit, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { MatSelectChange } from '@angular/material/select';
import { translate } from '@ngneat/transloco';
import { Canon } from '@sillsdev/scripture';
import { Delta } from 'quill';
import { TextData } from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import {
  BehaviorSubject,
  Observable,
  Subject,
  asyncScheduler,
  combineLatest,
  map,
  observeOn,
  startWith,
  tap
} from 'rxjs';
import { CommandError } from 'xforge-common/command.service';
import { DialogService } from 'xforge-common/dialog.service';
import { ErrorReportingService } from 'xforge-common/error-reporting.service';
import { Snapshot } from 'xforge-common/models/snapshot';
import { TextSnapshot } from 'xforge-common/models/textsnapshot';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { SFProjectProfileDoc } from '../../../../core/models/sf-project-profile-doc';
import { TextDocId } from '../../../../core/models/text-doc';
import { ParatextService, Revision } from '../../../../core/paratext.service';
import { SFProjectService } from '../../../../core/sf-project.service';
import { TextDocService } from '../../../../core/text-doc.service';

export interface RevisionSelectEvent {
  revision: Revision;
  snapshot: Snapshot<TextData> | undefined;
}

@Component({
  selector: 'app-history-chooser',
  templateUrl: './history-chooser.component.html',
  styleUrls: ['./history-chooser.component.scss']
})
export class HistoryChooserComponent implements AfterViewInit, OnChanges {
  @Input() projectId?: string;
  @Input() bookNum?: number;
  @Input() chapter?: number;
  @Input() showDiff = true;
  @Output() showDiffChange = new EventEmitter<boolean>();
  @Output() revisionSelect = new EventEmitter<RevisionSelectEvent>();

  historyRevisions: Revision[] = [];
  selectedRevision: Revision | undefined;
  selectedSnapshot: TextSnapshot | undefined;

  // 'asyncScheduler' prevents ExpressionChangedAfterItHasBeenCheckedError
  private loading$ = new BehaviorSubject<boolean>(false);
  isLoading$: Observable<boolean> = this.loading$.pipe(observeOn(asyncScheduler));

  isSelectDisabled$: Observable<boolean> = combineLatest([
    this.isLoading$,
    this.onlineStatusService.onlineStatus$
  ]).pipe(map(([isLoading, isOnline]) => isLoading || !isOnline));

  private inputChanged$ = new Subject<void>();
  private bookId = '';
  private projectDoc: SFProjectProfileDoc | undefined;

  constructor(
    private readonly dialogService: DialogService,
    private readonly onlineStatusService: OnlineStatusService,
    private readonly noticeService: NoticeService,
    private readonly paratextService: ParatextService,
    private readonly projectService: SFProjectService,
    private readonly textDocService: TextDocService,
    private readonly errorReportingService: ErrorReportingService
  ) {}

  get canRestoreSnapshot(): boolean {
    return (
      this.selectedSnapshot?.data.ops != null &&
      this.textDocService.canEdit(this.projectDoc?.data, this.bookNum, this.chapter)
    );
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.bookNum) {
      this.bookId = Canon.bookNumberToId(changes.bookNum.currentValue, '');
    }

    this.inputChanged$.next();
  }

  ngAfterViewInit(): void {
    this.loadHistory();
  }

  loadHistory(): void {
    combineLatest([
      this.onlineStatusService.onlineStatus$,
      this.inputChanged$.pipe(
        startWith(undefined),
        tap(() => {
          // If component input changes, clear the history revisions so the revisions from the previous book or chapter
          // are not visible while awaiting the getRevisions API callback.
          // Don't clear revisions if only online status changes.
          this.historyRevisions = [];
        })
      )
    ]).subscribe(async ([isOnline]) => {
      if (isOnline && this.projectId != null && this.bookNum != null && this.chapter != null) {
        this.loading$.next(true);
        try {
          this.projectDoc = await this.projectService.getProfile(this.projectId);
          if (this.historyRevisions.length === 0) {
            this.historyRevisions =
              (await this.paratextService.getRevisions(this.projectId, this.bookId, this.chapter)) ?? [];

            if (this.historyRevisions.length > 0) {
              await this.selectRevision(this.historyRevisions[0]);
            }
          }
        } finally {
          this.loading$.next(false);
        }
      }
    });
  }

  async onSelectionChanged(e: MatSelectChange): Promise<void> {
    this.loading$.next(true);

    try {
      await this.selectRevision(e.value);
    } finally {
      this.loading$.next(false);
    }
  }

  async revertToSnapshot(): Promise<void> {
    if (!this.onlineStatusService.isOnline) {
      this.noticeService.show(translate('history_chooser.please_connect'));
      return;
    }
    // Ensure the user wants to proceed
    const confirmation: boolean = await this.dialogService.confirm(
      'history_chooser.confirm_revert',
      'history_chooser.confirm_yes'
    );
    if (!confirmation) return;

    // Ensure we have everything we need
    if (
      this.selectedRevision == null ||
      this.selectedSnapshot?.data.ops == null ||
      this.projectId == null ||
      this.projectDoc?.data == null ||
      this.bookNum == null ||
      this.chapter == null ||
      !this.canRestoreSnapshot
    ) {
      this.noticeService.showError(translate('history_chooser.error'));
      return;
    }

    try {
      // Revert to the snapshot
      const delta: Delta = new Delta(this.selectedSnapshot.data.ops);
      const textDocId = new TextDocId(this.projectId, this.bookNum, this.chapter, 'target');
      if (
        this.projectDoc.data?.texts.find(t => t.bookNum === this.bookNum)?.chapters.find(c => c.number === this.chapter)
          ?.isValid !== this.selectedSnapshot.isValid
      ) {
        await this.projectService.onlineSetIsValid(
          textDocId.projectId,
          textDocId.bookNum,
          textDocId.chapterNum,
          this.selectedSnapshot.isValid
        );
      }
      await this.textDocService.overwrite(textDocId, delta, 'History');

      this.noticeService.show(translate('history_chooser.revert_successful'));
      // Force the history editor to reload
      this.revisionSelect.emit({ revision: this.selectedRevision, snapshot: this.selectedSnapshot });
    } catch (err) {
      this.noticeService.showError(translate('history_chooser.revert_error'));
      if (err instanceof CommandError && err.message.includes('504 Gateway Timeout')) return;
      this.errorReportingService.silentError(
        'Error occurred restoring a snapshot',
        ErrorReportingService.normalizeError(err)
      );
    }
  }

  toggleDiff(): void {
    this.showDiff = !this.showDiff;
    this.showDiffChange.emit(this.showDiff);
  }

  private async selectRevision(revision: Revision): Promise<void> {
    if (this.projectId == null || this.chapter == null || this.bookNum == null || revision == null) {
      return;
    }

    // Set the revision and clear the snapshot
    this.selectedRevision = revision;
    this.selectedSnapshot = undefined;

    // Get the snapshot from the paratext service
    await this.paratextService
      .getSnapshot(this.projectId, this.bookId, this.chapter, revision.timestamp)
      .then(snapshot => {
        // Remember the snapshot so we can apply it
        this.selectedSnapshot = snapshot;
        this.revisionSelect.emit({ revision, snapshot });
      });
  }
}
