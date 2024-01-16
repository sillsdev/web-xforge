import { AfterViewInit, Component, DestroyRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DeltaStatic } from 'quill';
import { combineLatest, startWith, tap } from 'rxjs';
import { SFProjectService } from 'src/app/core/sf-project.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { Delta, TextDoc } from '../../../core/models/text-doc';
import { Revision } from '../../../core/paratext.service';
import { TextComponent } from '../../../shared/text/text.component';
import { EditorHistoryService } from './editor-history.service';
import { HistoryChooserComponent, RevisionSelectEvent } from './history-chooser/history-chooser.component';

@Component({
  selector: 'app-editor-history',
  templateUrl: './editor-history.component.html',
  styleUrls: ['./editor-history.component.scss']
})
export class EditorHistoryComponent implements AfterViewInit {
  @Input() projectId?: string;
  @Input() bookNum?: number;
  @Input() chapter?: number;
  @Input() isRightToLeft!: boolean;
  @Input() fontSize?: string;
  @Input() diffText?: TextComponent;
  @Output() revisionSelect = new EventEmitter<Revision>();

  @ViewChild(HistoryChooserComponent) historyChooser?: HistoryChooserComponent;
  @ViewChild(TextComponent) snapshotText?: TextComponent;

  constructor(
    private readonly destroyRef: DestroyRef,
    private readonly projectService: SFProjectService,
    private readonly editorHistoryService: EditorHistoryService,
    readonly onlineStatusService: OnlineStatusService
  ) {}

  ngAfterViewInit(): void {
    this.loadHistory();
  }

  private loadHistory(): void {
    if (this.historyChooser == null) {
      return;
    }

    combineLatest([
      this.historyChooser.revisionSelect.pipe(
        tap((e: RevisionSelectEvent) => {
          this.revisionSelect.emit(e.revision);
        })
      ),
      this.historyChooser.showDiffChange.pipe(startWith(this.historyChooser.showDiff))
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(async ([e, showDiff]: [RevisionSelectEvent, boolean]) => {
        let snapshotContents: DeltaStatic = new Delta(e.snapshot?.data.ops);
        this.snapshotText?.editor?.setContents(snapshotContents, 'api');

        // Show the diff, if requested
        if (showDiff && this.diffText?.id != null) {
          const textDoc: TextDoc = await this.projectService.getText(this.diffText.id);
          const targetContents: DeltaStatic = new Delta(textDoc.data?.ops);
          const diff = this.editorHistoryService.processDiff(snapshotContents, targetContents);

          this.snapshotText?.editor?.updateContents(diff, 'api');
        }
      });
  }
}
