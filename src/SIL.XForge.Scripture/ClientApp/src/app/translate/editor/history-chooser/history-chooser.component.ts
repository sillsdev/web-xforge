import { Component, Input, OnInit } from '@angular/core';
import { Canon } from '@sillsdev/scripture';
import { TextData } from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import { BehaviorSubject, combineLatest, Observable } from 'rxjs';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { I18nService } from 'xforge-common/i18n.service';
import { Snapshot } from 'xforge-common/models/snapshot';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { ParatextService, Revision } from '../../../core/paratext.service';

@Component({
  selector: 'app-history-chooser',
  templateUrl: './history-chooser.component.html',
  styleUrls: ['./history-chooser.component.scss']
})
export class HistoryChooserComponent extends DataLoadingComponent implements OnInit {
  private _bookNum?: number;
  private bookNum$: BehaviorSubject<number> = new BehaviorSubject<number>(0);
  private _chapter?: number;
  private chapter$: BehaviorSubject<number> = new BehaviorSubject<number>(0);
  private _historyRevision: Revision | undefined;
  private _projectId?: string;
  private projectId$: BehaviorSubject<string> = new BehaviorSubject<string>('');
  private _snapshot?: Snapshot<TextData>;
  private _snapshot$ = new BehaviorSubject<Snapshot<TextData> | undefined>(undefined);
  private _showDiff: boolean = false;
  private _showDiff$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);

  appOnline: boolean = false;
  showHistory: boolean = false;
  historyRevisions: Revision[] = [];

  constructor(
    private readonly i18n: I18nService,
    noticeService: NoticeService,
    private readonly onlineStatusService: OnlineStatusService,
    private readonly paratextService: ParatextService
  ) {
    super(noticeService);
  }

  @Input() set bookNum(bookNum: number | undefined) {
    if (bookNum == null) {
      return;
    }
    this._bookNum = bookNum;
    this.bookNum$.next(bookNum);
  }

  @Input() set chapter(chapter: number | undefined) {
    if (chapter == null) {
      return;
    }
    this._chapter = chapter;
    this.chapter$.next(chapter);
  }

  @Input() set projectId(id: string | undefined) {
    if (id == null) {
      return;
    }
    this._projectId = id;
    this.projectId$.next(id);
  }

  get historyRevision(): Revision | undefined {
    return this._historyRevision;
  }

  set historyRevision(value: Revision | undefined) {
    if (this._projectId == null || this._chapter == null || this._bookNum == null || value == null) {
      return;
    }
    // Set the revision
    this._historyRevision = value;
    // Get the snapshot from the paratext service
    this.paratextService
      .getSnapshot(this._projectId, Canon.bookNumberToId(this._bookNum, ''), this._chapter, value.key)
      .then(snapshot => {
        this._snapshot = snapshot;
        this._snapshot$.next(snapshot);
      });
  }

  get snapshot$(): Observable<Snapshot<TextData> | undefined> {
    return this._snapshot$;
  }

  get snapshot(): Snapshot<TextData> | undefined {
    return this._snapshot;
  }

  get showDiff$(): Observable<boolean> {
    return this._showDiff$;
  }

  get showDiff(): boolean {
    return this._showDiff;
  }

  set showDiff(value: boolean) {
    this._showDiff = value;
    this._showDiff$.next(value);
  }

  ngOnInit(): void {
    this.appOnline = this.onlineStatusService.isOnline;
    this.subscribe(
      combineLatest([this.onlineStatusService.onlineStatus$, this.projectId$, this.bookNum$, this.chapter$]),
      ([isOnline]) => {
        this.appOnline = isOnline;
        this.showHistory = false;
        this._snapshot$.next(undefined);
      }
    );
  }

  formatRevision(revision: Revision): string {
    var date = new Date(revision.key);
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    };
    return date.toLocaleString(this.i18n.locale.canonicalTag, options).replace(/,/g, '');
  }

  async loadHistory(): Promise<void> {
    if (this._projectId != null && this._bookNum != null && this._chapter != null) {
      this.loadingStarted();
      this.historyRevisions = [];
      this.historyRevisions =
        (await this.paratextService.getRevisions(
          this._projectId,
          Canon.bookNumberToId(this._bookNum, ''),
          this._chapter
        )) ?? [];
      if (this.historyRevisions.length > 0) {
        this.historyRevision = this.historyRevisions[0];
      }
      this.loadingFinished();
    }
  }

  async showHideHistory(): Promise<void> {
    this.showHistory = !this.showHistory;
    if (this.showHistory) {
      await this.loadHistory();
    } else {
      this._snapshot$.next(undefined);
    }
  }
}
