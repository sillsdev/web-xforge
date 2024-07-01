import { AfterViewInit, Component, DestroyRef, EventEmitter, Input, OnChanges, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DeltaStatic } from 'quill';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { DeltaOperation } from 'rich-text';
import {
  asyncScheduler,
  catchError,
  combineLatest,
  distinctUntilChanged,
  EMPTY,
  filter,
  from,
  map,
  Observable,
  startWith,
  Subject,
  switchMap,
  tap,
  throttleTime,
  throwError
} from 'rxjs';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DialogService } from 'xforge-common/dialog.service';
import { FontService } from 'xforge-common/font.service';
import { I18nService } from 'xforge-common/i18n.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { filterNullish } from 'xforge-common/util/rxjs-util';
import { isString } from '../../../../type-utils';
import { Delta, TextDocId } from '../../../core/models/text-doc';
import { SFProjectService } from '../../../core/sf-project.service';
import { TextDocService } from '../../../core/text-doc.service';
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
  draftCheckState: 'draft-unknown' | 'draft-present' | 'draft-legacy' | 'draft-empty' = 'draft-unknown';
  bookChapterName = '';
  generateDraftUrl?: string;
  targetProject?: SFProjectProfile;
  textDocId?: TextDocId;
  isDraftReady = false;
  isDraftApplied = false;
  canApplyDraft = false;

  private draftDelta?: DeltaStatic;
  private targetDelta?: DeltaStatic;

  constructor(
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly destroyRef: DestroyRef,
    private readonly dialogService: DialogService,
    private readonly draftGenerationService: DraftGenerationService,
    private readonly draftViewerService: DraftViewerService,
    readonly fontService: FontService,
    private readonly i18n: I18nService,
    private readonly projectService: SFProjectService,
    readonly onlineStatusService: OnlineStatusService,
    private readonly textDocService: TextDocService
  ) {}

  ngOnChanges(): void {
    if (this.projectId == null || this.bookNum == null || this.chapter == null) {
      throw new Error('projectId, bookNum, or chapter is null');
    }

    this.textDocId = new TextDocId(this.projectId, this.bookNum, this.chapter, 'target');
    this.inputChanged$.next();
  }

  async ngAfterViewInit(): Promise<void> {
    this.generateDraftUrl = `/projects/${this.projectId}/draft-generation`;
    this.populateDraftTextInit();
  }

  populateDraftTextInit(): void {
    combineLatest([
      this.onlineStatusService.onlineStatus$,
      this.draftText.editorCreated as EventEmitter<any>,
      this.inputChanged$.pipe(startWith(undefined))
    ])
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        filter(([isOnline]) => isOnline),
        tap(() => this.setInitialState()),
        switchMap(() => this.draftExists()),
        switchMap((draftExists: boolean) => {
          if (!draftExists) {
            this.draftCheckState = 'draft-empty';
            return EMPTY;
          }

          // Respond to project changes
          return this.activatedProjectService.changes$.pipe(
            filterNullish(),
            tap(projectDoc => {
              this.targetProject = projectDoc.data;
              this.canApplyDraft = this.canEdit();
            }),
            distinctUntilChanged()
          );
        }),
        switchMap(() => combineLatest([this.getTargetOps(), this.getDraft({ isDraftLegacy: false })])),
        map(([targetOps, draft]) => ({
          targetOps,
          // Convert legacy draft to draft ops
          draftOps: this.isDraftSegmentMap(draft)
            ? this.draftViewerService.toDraftOps(draft, targetOps, { overwrite: true })
            : draft
        }))
      )
      .subscribe(({ targetOps, draftOps }) => {
        this.draftDelta = new Delta(draftOps);
        this.targetDelta = new Delta(targetOps);

        // Set the draft editor with the pre-translation segments
        this.draftText.setContents(this.draftDelta, 'api');
        this.draftText.applyEditorStyles();

        this.isDraftApplied = this.draftDelta.diff(this.targetDelta).length() === 0;

        if (this.draftCheckState !== 'draft-legacy') {
          this.draftCheckState = 'draft-present';
        }

        this.isDraftReady = this.draftCheckState === 'draft-present' || this.draftCheckState === 'draft-legacy';
      });
  }

  private setInitialState(): void {
    this.draftCheckState = 'draft-unknown';
    this.bookChapterName = this.getLocalizedBookChapter();
    this.isDraftReady = false;
    this.isDraftApplied = false;
    this.canApplyDraft = false;
  }

  private draftExists(): Observable<boolean> {
    // This method of checking for draft may be temporary until there is a better way supplied by serval
    return this.draftGenerationService.draftExists(this.projectId!, this.bookNum!, this.chapter!);
  }

  private getDraft({ isDraftLegacy }: { isDraftLegacy: boolean }): Observable<DeltaOperation[] | DraftSegmentMap> {
    return isDraftLegacy
      ? // Fetch legacy draft
        this.draftGenerationService.getGeneratedDraft(this.projectId!, this.bookNum!, this.chapter!).pipe()
      : // Fetch draft in USFM format (fallback to legacy)
        this.draftGenerationService
          .getGeneratedDraftDeltaOperations(this.projectId!, this.bookNum!, this.chapter!)
          .pipe(
            catchError(err => {
              // If the corpus does not support USFM
              if (err.status === 405) {
                // Prompt the user to run a new build to use the new features
                this.draftCheckState = 'draft-legacy';
                return this.getDraft({ isDraftLegacy: true });
              }

              return throwError(() => err);
            })
          );
  }

  async applyDraft(): Promise<void> {
    if (this.draftDelta == null) {
      throw new Error('No draft ops to apply.');
    }

    // Warn before overwriting existing text
    if (this.hasContent(this.targetDelta?.ops)) {
      const proceed = await this.dialogService.confirm('editor_draft_tab.overwrite', 'editor_draft_tab.yes');
      if (!proceed) {
        return;
      }
    }

    this.textDocService.overwrite(this.textDocId!, this.draftDelta, 'draft');
    this.isDraftApplied = true;
  }

  private hasContent(delta?: DeltaOperation[]): boolean {
    const hasContent = delta?.some(op => {
      if (op.insert == null || op.attributes?.segment == null) {
        return false;
      }

      const isInsertBlank = (isString(op.insert) && op.insert.trim().length === 0) || op.insert.blank === true;
      return !isInsertBlank;
    });

    return hasContent ?? false;
  }

  private canEdit(): boolean {
    return (
      this.textDocService.canEdit(this.targetProject, this.bookNum, this.chapter) && !this.draftText?.areOpsCorrupted
    );
  }

  private getLocalizedBookChapter(): string {
    if (this.bookNum == null || this.chapter == null) {
      return '';
    }

    return this.i18n.localizeBook(this.bookNum) + ' ' + this.chapter;
  }

  private getTargetOps(): Observable<DeltaOperation[]> {
    return from(this.projectService.getText(this.textDocId!)).pipe(
      switchMap(textDoc =>
        textDoc.changes$.pipe(
          startWith(undefined),
          throttleTime(2000, asyncScheduler, { leading: true, trailing: true }),
          map(() => textDoc.data?.ops),
          filterNullish()
        )
      )
    );
  }

  private isDraftSegmentMap(draft: DeltaOperation[] | DraftSegmentMap): draft is DraftSegmentMap {
    return !Array.isArray(draft);
  }
}
