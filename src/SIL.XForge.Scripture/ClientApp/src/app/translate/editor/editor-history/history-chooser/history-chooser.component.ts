import { AfterViewInit, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { MatSelectChange } from '@angular/material/select';
import { Canon } from '@sillsdev/scripture';
import { TextData } from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import {
  asyncScheduler,
  BehaviorSubject,
  combineLatest,
  map,
  Observable,
  observeOn,
  startWith,
  Subject,
  tap
} from 'rxjs';
import { Snapshot } from 'xforge-common/models/snapshot';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { ParatextService, Revision } from '../../../../core/paratext.service';

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

  selectedRevision?: Revision;
  historyRevisions: Revision[] = [];

  // 'asyncScheduler' prevents ExpressionChangedAfterItHasBeenCheckedError
  private loading$ = new BehaviorSubject<boolean>(false);
  isLoading$: Observable<boolean> = this.loading$.pipe(observeOn(asyncScheduler));

  isSelectDisabled$: Observable<boolean> = combineLatest([
    this.isLoading$,
    this.onlineStatusService.onlineStatus$
  ]).pipe(map(([isLoading, isOnline]) => isLoading || !isOnline));

  private inputChanged$ = new Subject<void>();
  private bookId = '';

  constructor(readonly onlineStatusService: OnlineStatusService, private readonly paratextService: ParatextService) {}

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
          if (this.historyRevisions.length === 0) {
            this.historyRevisions =
              (await this.paratextService.getRevisions(this.projectId, this.bookId, this.chapter)) ?? [];

            if (this.historyRevisions.length > 0) {
              this.selectRevision(this.historyRevisions[0]);
            }
          }
        } finally {
          this.loading$.next(false);
        }
      }
    });
  }

  onSelectionChanged(e: MatSelectChange): void {
    this.selectRevision(e.value);
  }

  toggleDiff(): void {
    this.showDiff = !this.showDiff;
    this.showDiffChange.emit(this.showDiff);
  }

  private selectRevision(revision: Revision): void {
    if (this.projectId == null || this.chapter == null || this.bookNum == null || revision == null) {
      return;
    }

    // Set the revision
    this.selectedRevision = revision as Revision;

    // Get the snapshot from the paratext service
    this.paratextService.getSnapshot(this.projectId, this.bookId, this.chapter, revision.key).then(snapshot => {
      this.revisionSelect.emit({ revision: revision, snapshot: snapshot });
    });
  }
}
