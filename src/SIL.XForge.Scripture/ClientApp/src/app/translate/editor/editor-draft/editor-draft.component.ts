import { AfterViewInit, Component, DestroyRef, Input, OnChanges, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { cloneDeep } from 'lodash-es';
import { DeltaOperation, DeltaStatic } from 'quill';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectDomain, SF_PROJECT_RIGHTS } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { TextInfoPermission } from 'realtime-server/lib/esm/scriptureforge/models/text-info-permission';
import { Chapter, TextInfo } from 'realtime-server/scriptureforge/models/text-info';
import {
  catchError,
  combineLatest,
  EMPTY,
  filter,
  map,
  Observable,
  startWith,
  Subject,
  switchMap,
  take,
  tap,
  throwError
} from 'rxjs';
import { SFProjectService } from 'src/app/core/sf-project.service';
import { isString } from 'src/type-utils';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nService } from 'xforge-common/i18n.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { UserService } from 'xforge-common/user.service';
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
  draftCheckState: 'draft-unknown' | 'draft-present' | 'draft-legacy' | 'draft-empty' = 'draft-unknown';
  bookChapterName = '';
  generateDraftUrl?: string;
  isDraftApplied = false;

  private targetProject?: SFProjectProfile;

  constructor(
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly destroyRef: DestroyRef,
    private readonly draftGenerationService: DraftGenerationService,
    private readonly draftViewerService: DraftViewerService,
    private readonly i18n: I18nService,
    private readonly projectService: SFProjectService,
    readonly onlineStatusService: OnlineStatusService,
    private readonly userService: UserService,
    private readonly dialogService: DialogService
  ) {}

  ngOnChanges(): void {
    this.inputChanged$.next();
  }

  async ngAfterViewInit(): Promise<void> {
    this.generateDraftUrl = `/projects/${this.activatedProjectService.projectId}/draft-generation`;
    const profileDoc = await this.projectService.getProfile(this.projectId!);
    this.targetProject = profileDoc.data;
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

          if (this.activatedProjectService.projectDoc?.data?.translateConfig.draftConfig.sendAllSegments) {
            return this.getLegacyGeneratedDraft(targetOps);
          } else {
            return this.draftGenerationService
              .getGeneratedDraftDeltaOperations(this.projectId, this.bookNum, this.chapter)
              .pipe(
                take(1),
                catchError(err => {
                  // If the corpus does not support USFM
                  if (err.status === 405) {
                    // Prompt the user to run a new build to use the new features
                    this.draftCheckState = 'draft-legacy';
                    return this.getLegacyGeneratedDraft(targetOps);
                  }
                  return throwError(() => err);
                }),
                tap((ops: DeltaOperation[]) => {
                  // Check for empty draft
                  if (ops.length === 0) {
                    this.draftCheckState = 'draft-empty';
                  } else if (this.draftCheckState !== 'draft-legacy') {
                    this.draftCheckState = 'draft-present';
                  }
                })
              );
          }
        })
      )
      .subscribe(async (draftOps: DeltaOperation[]) => {
        // Set the draft editor with the pre-translation segments
        this.draftText.editor?.setContents(new Delta(draftOps), 'api');
        this.isDraftApplied = (await this.getDiff()).length() === 0;
      });
  }

  private getLegacyGeneratedDraft(targetOps: DeltaOperation[]): Observable<DeltaOperation[]> {
    return this.draftGenerationService.getGeneratedDraft(this.projectId!, this.bookNum!, this.chapter!).pipe(
      map((draft: DraftSegmentMap) => {
        // Check for empty draft
        if (Object.keys(draft).length === 0) {
          this.draftCheckState = 'draft-empty';
          return [];
        } else if (this.draftCheckState !== 'draft-legacy') {
          this.draftCheckState = 'draft-present';
        }

        // Overwrite existing text with draft text
        return this.draftViewerService.toDraftOps(draft, targetOps, { overwrite: true });
      })
    );
  }

  get hasDraft(): boolean {
    return this.draftCheckState === 'draft-present' || this.draftCheckState === 'draft-legacy';
  }

  async applyDraft(): Promise<void> {
    if (await this.doesTargetHaveContent()) {
      const proceed = await this.dialogService.confirm('editor_draft_tab.overwrite', 'editor_draft_tab.yes');
      if (!proceed) return;
    }

    const diff: DeltaStatic = await this.getDiff();

    const targetTextDocId = new TextDocId(this.projectId!, this.bookNum!, this.chapter!, 'target');
    this.draftViewerService.draftApplied.emit({ id: targetTextDocId, ops: diff });
    this.isDraftApplied = true;
  }

  private async doesTargetHaveContent(): Promise<boolean> {
    const target = await this.getTargetOps();
    const doesTargetHaveContent = target?.some(op => {
      if (op.insert == null || op.attributes?.segment == null) {
        return false;
      }

      const isInsertBlank = (isString(op.insert) && op.insert.trim().length === 0) || op.insert.blank === true;
      return !isInsertBlank;
    });
    return doesTargetHaveContent ?? false;
  }

  /**
   * This code is reimplemented from editor.component.ts
   */
  get canEdit(): boolean {
    return (
      this.isUsfmValid &&
      this.userHasGeneralEditRight &&
      this.hasChapterEditPermission &&
      this.targetProject?.sync?.dataInSync !== false &&
      !this.draftText?.areOpsCorrupted &&
      this.targetProject?.editable === true
    );
  }

  private async getDiff(): Promise<DeltaStatic> {
    const target = new Delta(await this.getTargetOps());
    if (target.ops == null) {
      throw new Error(`Computing diff when 'target.ops' is not set`);
    }

    if (this.draftText.editor == null) {
      throw new Error(`'Computing diff when 'draftText.editor' is not set`);
    }

    const draftOps: DeltaOperation[] = [...this.draftText.editor.getContents().ops!];
    const cleanedOps: DeltaStatic = new Delta(this.cleanDraftOps(draftOps));
    const diff: DeltaStatic = target.diff(cleanedOps);
    return diff;
  }

  /**
   * This function is duplicated from editor.component.ts
   */
  private get isUsfmValid(): boolean {
    let text: TextInfo | undefined = this.targetProject?.texts.find(t => t.bookNum === this.bookNum);
    if (text == null) {
      return true;
    }

    const chapter: Chapter | undefined = text.chapters.find(c => c.number === this.chapter);
    return chapter?.isValid ?? false;
  }

  /**
   * This function is duplicated from editor.component.ts.
   */
  private get userHasGeneralEditRight(): boolean {
    if (this.targetProject == null) {
      return false;
    }
    return SF_PROJECT_RIGHTS.hasRight(
      this.targetProject,
      this.userService.currentUserId,
      SFProjectDomain.Texts,
      Operation.Edit
    );
  }

  /**
   * This function is duplicated from editor.component.ts.
   */
  private get hasChapterEditPermission(): boolean {
    const chapter: Chapter | undefined = this.targetProject?.texts
      .find(t => t.bookNum === this.bookNum)
      ?.chapters.find(c => c.number === this.chapter);
    // Even though permissions is guaranteed to be there in the model, its not in IndexedDB the first time the project
    // is accessed after migration
    const permission: string | undefined = chapter?.permissions?.[this.userService.currentUserId];
    return permission == null ? false : permission === TextInfoPermission.Write;
  }

  // Remove draft flag from attributes
  private cleanDraftOps(draftOps: DeltaOperation[]): DeltaOperation[] {
    const newOps = draftOps.map(op => cloneDeep(op));
    newOps.forEach((op: DeltaOperation) => {
      delete op.attributes?.draft;
    });
    return newOps;
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

  getTextDocId(): TextDocId {
    if (this.projectId == null || this.bookNum == null || this.chapter == null) {
      throw new Error('projectId, bookNum, or chapter is null');
    }

    return new TextDocId(this.projectId, this.bookNum, this.chapter, 'target');
  }
}
