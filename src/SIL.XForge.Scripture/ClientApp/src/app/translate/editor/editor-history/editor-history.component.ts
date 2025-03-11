import {
  AfterViewInit,
  Component,
  DestroyRef,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  ViewChild
} from '@angular/core';
import { Delta } from 'quill';
import { combineLatest, startWith, tap } from 'rxjs';
import { FontService } from 'xforge-common/font.service';
import { I18nService } from 'xforge-common/i18n.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { quietTakeUntilDestroyed } from 'xforge-common/utils';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { TextDoc } from '../../../core/models/text-doc';
import { Revision } from '../../../core/paratext.service';
import { SFProjectService } from '../../../core/sf-project.service';
import { TextComponent } from '../../../shared/text/text.component';
import { EditorHistoryService } from './editor-history.service';
import { HistoryChooserComponent, RevisionSelectEvent } from './history-chooser/history-chooser.component';

@Component({
  selector: 'app-editor-history',
  templateUrl: './editor-history.component.html',
  styleUrls: ['./editor-history.component.scss']
})
export class EditorHistoryComponent implements OnChanges, OnInit, AfterViewInit {
  @Input() projectId?: string;
  @Input() bookNum?: number;
  @Input() chapter?: number;
  @Input() isRightToLeft!: boolean;
  @Input() fontSize?: string;
  @Input() diffText?: TextComponent;
  @Output() revisionSelect = new EventEmitter<Revision | undefined>();

  @ViewChild(HistoryChooserComponent) historyChooser?: HistoryChooserComponent;
  @ViewChild(TextComponent) snapshotText?: TextComponent;

  loadedRevision?: Revision;
  isViewInitialized = false;
  projectDoc: SFProjectProfileDoc | undefined;

  constructor(
    private readonly destroyRef: DestroyRef,
    private readonly editorHistoryService: EditorHistoryService,
    readonly fontService: FontService,
    private readonly i18nService: I18nService,
    readonly onlineStatusService: OnlineStatusService,
    private readonly projectService: SFProjectService
  ) {}

  ngOnChanges(): void {
    // Clear any loaded revision if chapter changes
    this.loadedRevision = undefined;

    // Emit 'undefined' on chapter change, but only after view is initialized (not 'firstChanges')
    if (this.isViewInitialized) {
      this.revisionSelect.emit(undefined);
    }
  }

  ngOnInit(): void {
    // When the locale changes, emit the loaded Revision again, as the date formatting will need to update
    this.i18nService.locale$
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.revisionSelect.emit(this.loadedRevision));
  }

  ngAfterViewInit(): void {
    this.isViewInitialized = true;
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
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(async ([e, showDiff]: [RevisionSelectEvent, boolean]) => {
        const snapshotContents: Delta = new Delta(e.snapshot?.data.ops);
        this.snapshotText?.setContents(snapshotContents, 'api');
        this.loadedRevision = e.revision;

        // Show the diff, if requested
        if (showDiff && this.diffText?.id != null) {
          const textDoc: TextDoc = await this.projectService.getText(this.diffText.id);
          const targetContents: Delta = new Delta(textDoc.data?.ops);
          const diff = this.editorHistoryService.processDiff(snapshotContents, targetContents);

          this.snapshotText?.editor?.updateContents(diff, 'api');
          this.snapshotText?.applyEditorStyles();
        }
      });
  }
}
