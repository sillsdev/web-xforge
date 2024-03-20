import { AfterViewInit, Component, DestroyRef, Input, OnChanges, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DeltaOperation } from 'quill';
import { combineLatest, EMPTY, filter, map, startWith, Subject, switchMap, tap } from 'rxjs';
import { SFProjectService } from 'src/app/core/sf-project.service';
import { I18nService } from 'xforge-common/i18n.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { Delta, TextDocId } from '../../../core/models/text-doc';
import { TextComponent } from '../../../shared/text/text.component';
import { DraftSegmentMap } from '../../draft-generation/draft-generation';
import { DraftGenerationService } from '../../draft-generation/draft-generation.service';
import { DraftViewerService } from '../../draft-generation/draft-viewer/draft-viewer.service';

@Component({
  selector: 'app-editor-draft',
  templateUrl: './editor-draft.component.html',
  styleUrls: ['./editor-draft.component.scss']
})
export class EditorDraftComponent implements AfterViewInit, OnChanges {
  @Input() projectId?: string;
  @Input() bookNum?: number;
  @Input() chapter?: number;
  @Input() isRightToLeft!: boolean;
  @Input() fontSize?: string;

  @ViewChild(TextComponent) draftText!: TextComponent;

  inputChanged$ = new Subject<void>();
  draftCheckState: 'draft-unknown' | 'draft-present' | 'draft-empty' = 'draft-unknown';
  bookChapterName = '';

  constructor(
    private readonly destroyRef: DestroyRef,
    private readonly draftGenerationService: DraftGenerationService,
    private readonly draftViewerService: DraftViewerService,
    private readonly i18n: I18nService,
    private readonly projectService: SFProjectService,
    readonly onlineStatusService: OnlineStatusService
  ) {}

  ngOnChanges(): void {
    this.inputChanged$.next();
  }

  ngAfterViewInit(): void {
    this.populateDraftTextInit();
  }

  populateDraftTextInit(): void {
    combineLatest([this.draftText.editorCreated, this.inputChanged$.pipe(startWith(undefined))])
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        tap(() => {
          this.draftCheckState = 'draft-unknown';
          this.bookChapterName = this.getLocalizedBookChapter();
        }),
        switchMap(() => {
          return this.onlineStatusService.onlineStatus$.pipe(filter(isOnline => isOnline));
        }),
        switchMap(() => this.getTargetOps()),
        switchMap((targetOps: DeltaOperation[] | undefined) => {
          if (this.projectId == null || this.bookNum == null || this.chapter == null || targetOps == null) {
            return EMPTY;
          }

          return this.draftGenerationService.getGeneratedDraft(this.projectId, this.bookNum, this.chapter).pipe(
            map((draft: DraftSegmentMap) => {
              // Check for empty draft
              if (Object.keys(draft).length === 0) {
                this.draftCheckState = 'draft-empty';
                return [];
              }

              this.draftCheckState = 'draft-present';

              // Overwrite existing text with draft text
              return this.draftViewerService.toDraftOps(draft, targetOps, { overwrite: true });
            })
          );
        })
      )
      .subscribe((draftOps: DeltaOperation[]) => {
        // Set the draft editor with the pre-translation segments
        this.draftText.editor?.setContents(new Delta(draftOps), 'api');
      });
  }

  private getLocalizedBookChapter(): string {
    if (this.bookNum == null || this.chapter == null) {
      return '';
    }

    return this.i18n.localizeBook(this.bookNum) + ' ' + this.chapter;
  }

  private async getTargetOps(): Promise<DeltaOperation[] | undefined> {
    return (await this.projectService.getText(this.getTextDocId())).data?.ops;
  }

  private getTextDocId(): TextDocId {
    if (this.projectId == null || this.bookNum == null || this.chapter == null) {
      throw new Error('projectId, bookNum, or chapter is null');
    }

    return new TextDocId(this.projectId, this.bookNum, this.chapter, 'target');
  }
}
