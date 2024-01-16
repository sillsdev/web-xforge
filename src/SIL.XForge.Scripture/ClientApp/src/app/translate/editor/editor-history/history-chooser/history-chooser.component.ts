import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { MatSelectChange } from '@angular/material/select';
import { Canon } from '@sillsdev/scripture';
import { TextData } from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import { asyncScheduler, BehaviorSubject, Observable, observeOn } from 'rxjs';
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
export class HistoryChooserComponent implements OnChanges {
  @Input() projectId?: string;
  @Input() bookNum?: number;
  @Input() chapter?: number;
  @Input() showDiff = true;
  @Output() showDiffChange = new EventEmitter<boolean>();
  @Output() revisionSelect = new EventEmitter<RevisionSelectEvent>();

  // 'asyncScheduler' prevents ExpressionChangedAfterItHasBeenCheckedError
  private loading$ = new BehaviorSubject<boolean>(false);
  isLoading$: Observable<boolean> = this.loading$.pipe(observeOn(asyncScheduler));

  selectedRevision?: Revision;
  historyRevisions: Revision[] = [];

  private bookId = '';

  constructor(readonly onlineStatusService: OnlineStatusService, private readonly paratextService: ParatextService) {}

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (changes.bookNum) {
      this.bookId = Canon.bookNumberToId(changes.bookNum.currentValue, '');
    }

    await this.loadHistory();
  }

  async loadHistory(): Promise<void> {
    if (this.projectId != null && this.bookNum != null && this.chapter != null) {
      this.loading$.next(true);
      try {
        // Clear the history revisions, so the revisions from the previous book or chapter
        // are not visible while awaiting the getRevisions API callback.
        this.historyRevisions = [];
        this.historyRevisions =
          (await this.paratextService.getRevisions(this.projectId, this.bookId, this.chapter)) ?? [];
        if (this.historyRevisions.length > 0) {
          this.selectRevision(this.historyRevisions[0]);
        }
      } finally {
        this.loading$.next(false);
      }
    }
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
