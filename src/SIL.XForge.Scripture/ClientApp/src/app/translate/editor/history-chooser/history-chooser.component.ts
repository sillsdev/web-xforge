import { Component, Input, OnInit, ViewChild } from '@angular/core';
import { Canon } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/canon';
import { BehaviorSubject, combineLatest } from 'rxjs';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { NoticeService } from 'xforge-common/notice.service';
import { PwaService } from 'xforge-common/pwa.service';
import { ParatextService, Revision } from '../../../core/paratext.service';

@Component({
  selector: 'app-history-chooser',
  templateUrl: './history-chooser.component.html',
  styleUrls: ['./history-chooser.component.css']
})
export class HistoryChooserComponent extends DataLoadingComponent implements OnInit {
  private _bookNum?: number;
  private bookNum$: BehaviorSubject<number> = new BehaviorSubject<number>(0);
  private _chapter?: number;
  private chapter$: BehaviorSubject<number> = new BehaviorSubject<number>(0);
  private _projectId?: string;
  private projectId$: BehaviorSubject<string> = new BehaviorSubject<string>('');

  appOnline: boolean = false;
  showHistory: boolean = false;
  historyRevisions: Revision[] = [];
  historyRevision: Revision | undefined;

  constructor(
    noticeService: NoticeService,
    private readonly paratextService: ParatextService,
    private readonly pwaService: PwaService
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

  ngOnInit(): void {
    this.appOnline = this.pwaService.isOnline;
    this.subscribe(
      combineLatest([this.pwaService.onlineStatus$, this.projectId$, this.bookNum$, this.chapter$]),
      ([isOnline]) => {
        this.appOnline = isOnline;
        this.showHistory = false;
      }
    );
  }

  formatRevision(revision: Revision): string {
    var date = new Date(revision.key);
    return date.toDateString();
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
    }
  }
}
