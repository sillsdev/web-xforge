import { AfterViewInit, Component, Input, OnChanges, ViewChild } from '@angular/core';
import { DeltaOperation } from 'quill';
import { combineLatest, EMPTY, map, of, startWith, Subject, switchMap, tap, throwError } from 'rxjs';
import { I18nService } from 'xforge-common/i18n.service';
import { Delta } from '../../../core/models/text-doc';
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
  @Input() targetText?: TextComponent;

  @ViewChild(TextComponent) draftText!: TextComponent;

  inputChanged$ = new Subject<void>();
  draftCheckState: 'draft-unknown' | 'draft-present' | 'draft-empty' = 'draft-unknown';
  bookChapterName = '';

  constructor(
    private readonly draftGenerationService: DraftGenerationService,
    private readonly draftViewerService: DraftViewerService,
    private readonly i18n: I18nService
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
        tap(() => {
          this.draftCheckState = 'draft-unknown';
          this.bookChapterName = this.getLocalizedBookChapter();
        }),
        switchMap(() => {
          // Check for target text editor
          if (this.targetText?.editor == null) {
            return throwError(() => new Error('target text editor is null'));
          }

          const targetOps = this.getTargetOps();

          // If target text is not loaded, wait for it to load
          if (targetOps == null || targetOps.length <= 1) {
            return this.targetText?.loaded;
          }

          // Otherwise, return obs that emits and completes
          return of(undefined);
        }),
        switchMap(() => {
          const targetOps = this.getTargetOps();

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

  private getTargetOps(): DeltaOperation[] | undefined {
    return this.targetText?.editor?.getContents()?.ops;
  }

  private getLocalizedBookChapter(): string {
    if (this.bookNum == null || this.chapter == null) {
      return '';
    }

    return this.i18n.localizeBook(this.bookNum) + ' ' + this.chapter;
  }
}
