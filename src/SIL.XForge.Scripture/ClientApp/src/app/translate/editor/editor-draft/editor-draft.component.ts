import { AfterViewInit, Component, DestroyRef, EventEmitter, Input, OnChanges, ViewChild } from '@angular/core';
import { MatSelectChange } from '@angular/material/select';
import { Delta } from 'quill';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { DeltaOperation } from 'rich-text';
import {
  asyncScheduler,
  BehaviorSubject,
  combineLatest,
  distinctUntilChanged,
  EMPTY,
  filter,
  from,
  map,
  merge,
  Observable,
  observeOn,
  of,
  startWith,
  Subject,
  switchMap,
  tap,
  throttleTime
} from 'rxjs';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { isNetworkError } from 'xforge-common/command.service';
import { DialogService } from 'xforge-common/dialog.service';
import { ErrorReportingService } from 'xforge-common/error-reporting.service';
import { FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { FontService } from 'xforge-common/font.service';
import { I18nService } from 'xforge-common/i18n.service';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { filterNullish, quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { isString } from '../../../../type-utils';
import { TextDocId } from '../../../core/models/text-doc';
import { Revision } from '../../../core/paratext.service';
import { SFProjectService } from '../../../core/sf-project.service';
import { TextComponent } from '../../../shared/text/text.component';
import { DraftGenerationService } from '../../draft-generation/draft-generation.service';
import { DraftHandlingService } from '../../draft-generation/draft-handling.service';
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
  @Input() timestamp?: Date;

  @ViewChild(TextComponent) draftText!: TextComponent;

  inputChanged$ = new Subject<void>();
  draftCheckState: 'draft-unknown' | 'draft-present' | 'draft-legacy' | 'draft-empty' = 'draft-unknown';
  draftRevisions: Revision[] = [];
  selectedRevision: Revision | undefined;
  bookChapterName = '';
  generateDraftUrl?: string;
  targetProject?: SFProjectProfile;
  textDocId?: TextDocId;
  isDraftReady = false;
  isDraftApplied = false;
  userAppliedDraft = false;

  private selectedRevisionSubject = new BehaviorSubject<Revision | undefined>(undefined);
  private selectedRevision$ = this.selectedRevisionSubject.asObservable();

  // 'asyncScheduler' prevents ExpressionChangedAfterItHasBeenCheckedError
  private loading$ = new BehaviorSubject<boolean>(false);
  isLoading$: Observable<boolean> = this.loading$.pipe(observeOn(asyncScheduler));

  isSelectDisabled$: Observable<boolean> = combineLatest([
    this.isLoading$,
    this.onlineStatusService.onlineStatus$
  ]).pipe(map(([isLoading, isOnline]) => isLoading || !isOnline));

  private draftDelta?: Delta;
  private targetDelta?: Delta;

  constructor(
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly destroyRef: DestroyRef,
    private readonly dialogService: DialogService,
    private readonly draftGenerationService: DraftGenerationService,
    private readonly draftHandlingService: DraftHandlingService,
    readonly featureFlags: FeatureFlagService,
    readonly fontService: FontService,
    private readonly i18n: I18nService,
    private readonly projectService: SFProjectService,
    readonly onlineStatusService: OnlineStatusService,
    private readonly noticeService: NoticeService,
    private errorReportingService: ErrorReportingService
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

  async onSelectionChanged(e: MatSelectChange): Promise<void> {
    this.selectedRevision = e.value;
    this.selectedRevisionSubject.next(this.selectedRevision);
  }

  populateDraftTextInit(): void {
    combineLatest([
      this.onlineStatusService.onlineStatus$,
      this.draftText.editorCreated as EventEmitter<any>,
      this.inputChanged$.pipe(startWith(undefined))
    ])
      .pipe(
        quietTakeUntilDestroyed(this.destroyRef),
        filter(([isOnline]) => isOnline),
        tap(() => this.setInitialState()),
        switchMap(() =>
          combineLatest([
            merge(
              this.draftGenerationService
                .getGeneratedDraftHistory(
                  this.textDocId!.projectId,
                  this.textDocId!.bookNum,
                  this.textDocId!.chapterNum
                )
                .pipe(
                  map(revisions => {
                    if (revisions != null) {
                      // Sort revisions by timestamp descending
                      this.draftRevisions = [...revisions].sort((a, b) => {
                        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
                      });
                      const date = this.timestamp ?? new Date();
                      // Don't emit this.selectedRevision$, as the merge will handle this
                      this.selectedRevision = this.findClosestRevision(date, this.draftRevisions);
                      return date;
                    } else {
                      return undefined;
                    }
                  })
                ),
              this.selectedRevision$.pipe(
                filter((rev): rev is { timestamp: string } => rev != null),
                map(revision => new Date(revision.timestamp))
              )
            ),
            this.draftExists()
          ])
        ),
        switchMap(([timestamp, draftExists]) => {
          const initialTimestamp: Date | undefined = timestamp ?? this.timestamp;
          // If an earlier draft exists, hide it if the draft history feature is not enabled
          if (!draftExists && (!this.featureFlags.newDraftHistory.enabled || initialTimestamp == null)) {
            this.draftCheckState = 'draft-empty';
            return EMPTY;
          }

          // Respond to project changes
          return this.activatedProjectService.changes$.pipe(
            filterNullish(),
            tap(projectDoc => {
              this.targetProject = projectDoc.data;
            }),
            distinctUntilChanged(),
            map(() => initialTimestamp)
          );
        }),
        switchMap((timestamp: Date | undefined) =>
          combineLatest([
            this.getTargetOps(),
            this.draftHandlingService.getDraft(this.textDocId!, { isDraftLegacy: false, timestamp })
          ])
        ),
        tap(([_, draft]) => {
          if (this.draftHandlingService.isDraftSegmentMap(draft)) {
            this.draftCheckState = 'draft-legacy';
          }
        }),
        map(([targetOps, draft]) => {
          return {
            targetOps,
            // Convert legacy draft to draft ops if necessary
            draftOps: this.draftHandlingService.draftDataToOps(draft, targetOps)
          };
        }),
        switchMap(({ targetOps, draftOps }) => {
          // Look for verses that contain text. If these are present, this is a non-empty draft
          for (const op of draftOps) {
            if (op.attributes != null && op.attributes.segment != null && typeof op.insert === 'string') {
              const hasText: boolean = op.insert.trim().length > 0;
              const segRef: string = op.attributes.segment as string;
              if (hasText && segRef.startsWith('verse_')) {
                return of({ targetOps, draftOps });
              }
            }
          }

          // No generated verse segments were found, return an empty draft
          this.draftCheckState = 'draft-empty';
          return EMPTY;
        })
      )
      .subscribe(({ targetOps, draftOps }) => {
        this.draftDelta = new Delta(draftOps);
        this.targetDelta = new Delta(targetOps);

        // Set the draft editor with the pre-translation segments
        this.draftText.setContents(this.draftDelta, 'api');
        this.draftText.applyEditorStyles();

        this.isDraftApplied =
          this.targetProject?.texts.find(t => t.bookNum === this.bookNum)?.chapters.find(c => c.number === this.chapter)
            ?.draftApplied ?? false;

        if (this.draftCheckState !== 'draft-legacy') {
          this.draftCheckState = 'draft-present';
        }

        this.isDraftReady = this.draftCheckState === 'draft-present' || this.draftCheckState === 'draft-legacy';
      });
  }

  get canApplyDraft(): boolean {
    if (this.targetProject == null || this.bookNum == null || this.chapter == null || this.draftDelta?.ops == null) {
      return false;
    }
    return this.draftHandlingService.canApplyDraft(this.targetProject, this.bookNum, this.chapter, this.draftDelta.ops);
  }

  async applyDraft(): Promise<void> {
    if (this.draftDelta == null) {
      throw new Error('No draft ops to apply.');
    }

    // Warn before overwriting existing text
    if (this.hasContent(this.targetDelta?.ops)) {
      const proceed: boolean = await this.dialogService.confirm('editor_draft_tab.overwrite', 'editor_draft_tab.yes');
      if (!proceed) {
        return;
      }
    }

    try {
      await this.draftHandlingService.applyChapterDraftAsync(this.textDocId!, this.draftDelta);
      this.isDraftApplied = true;
      this.userAppliedDraft = true;
    } catch (err) {
      this.noticeService.showError(this.i18n.translateStatic('editor_draft_tab.error_applying_draft'));
      if (!isNetworkError(err)) {
        this.errorReportingService.silentError(
          'Error applying a draft to a chapter',
          ErrorReportingService.normalizeError(err)
        );
      }
    }
  }

  private setInitialState(): void {
    this.draftCheckState = 'draft-unknown';
    this.bookChapterName = this.getLocalizedBookChapter();
    this.isDraftReady = false;
    this.isDraftApplied = false;
    this.userAppliedDraft = false;
  }

  private draftExists(): Observable<boolean> {
    // This method of checking for draft may be temporary until there is a better way supplied by serval
    return this.draftGenerationService.draftExists(this.projectId!, this.bookNum!, this.chapter!);
  }

  private findClosestRevision(date: Date, revisions: Revision[]): Revision | undefined {
    const targetTime: number = date.getTime();

    let closestLater: Revision | undefined;
    let closestEarlier: Revision | undefined;

    // The revisions are sorted in descending order
    for (const rev of revisions) {
      const revTime = new Date(rev.timestamp).getTime();
      if (revTime > targetTime) {
        closestLater = rev;
      } else {
        closestEarlier = rev;
        break;
      }
    }

    return closestEarlier ?? closestLater;
  }

  private hasContent(delta?: DeltaOperation[]): boolean {
    const hasContent = delta?.some(op => {
      if (op.insert == null || op.attributes?.segment == null) {
        return false;
      }

      const isInsertBlank =
        (isString(op.insert) && op.insert.trim().length === 0) || (!isString(op.insert) && op.insert.blank === true);
      return !isInsertBlank;
    });

    return hasContent ?? false;
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
}
