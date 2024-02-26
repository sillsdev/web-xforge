import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, NavigationBehaviorOptions, ParamMap, Router } from '@angular/router';
import { Canon } from '@sillsdev/scripture';
import { DeltaOperation, DeltaStatic } from 'quill';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectDomain, SF_PROJECT_RIGHTS } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { TextInfoPermission } from 'realtime-server/lib/esm/scriptureforge/models/text-info-permission';
import { Chapter } from 'realtime-server/scriptureforge/models/text-info';
import { filter, map, switchMap, tap } from 'rxjs/operators';
import { Delta, TextDocId } from 'src/app/core/models/text-doc';
import { SFProjectService } from 'src/app/core/sf-project.service';
import { TextComponent } from 'src/app/shared/text/text.component';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { UserService } from 'xforge-common/user.service';
import { DraftSegmentMap } from '../draft-generation';
import { DraftGenerationService } from '../draft-generation.service';
import { DraftViewerService } from './draft-viewer.service';

@Component({
  selector: 'app-draft-viewer',
  templateUrl: './draft-viewer.component.html',
  styleUrls: ['./draft-viewer.component.scss']
})
export class DraftViewerComponent extends SubscriptionDisposable implements OnInit {
  @ViewChild('targetText') targetEditor!: TextComponent; // Already translated interleaved with draft

  books: number[] = [];
  currentBook?: number;

  chapters: number[] = [];
  currentChapter?: number;

  sourceProjectId?: string;
  targetProjectId!: string;

  sourceProject?: SFProjectProfile;
  targetProject?: SFProjectProfile;

  sourceTextDocId?: TextDocId;
  targetTextDocId?: TextDocId;

  isDraftApplied = false;
  hasDraft = false;
  draftPopulated = false;
  isOnline = this.onlineStatusService.isOnline;

  // This is so the source is hidden when it is missing (behavior consistent with the translate editor).
  // Note: When an alternate source is specified, that is used for draft generation instead. When that occurs,
  //       the source is only used for display, and may not include some books contained in the alternate source.
  bookHasSource = false;

  projectSettingsUrl?: string;
  preDraftTargetDelta?: DeltaStatic;

  constructor(
    private readonly draftGenerationService: DraftGenerationService,
    private readonly draftViewerService: DraftViewerService,
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly projectService: SFProjectService,
    private readonly userService: UserService,
    private readonly onlineStatusService: OnlineStatusService,
    private readonly activatedRoute: ActivatedRoute,
    private readonly router: Router
  ) {
    super();
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
      !this.targetEditor?.areOpsCorrupted &&
      this.targetProject?.editable === true
    );
  }

  /**
   * This function is duplicated from editor.component.ts
   */
  private get isUsfmValid(): boolean {
    let text: TextInfo | undefined = this.targetProject?.texts.find(t => t.bookNum === this.currentBook);
    if (text == null) {
      return true;
    }

    const chapter: Chapter | undefined = text.chapters.find(c => c.number === this.currentChapter);
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
      .find(t => t.bookNum === this.currentBook)
      ?.chapters.find(c => c.number === this.currentChapter);
    // Even though permissions is guaranteed to be there in the model, its not in IndexedDB the first time the project
    // is accessed after migration
    const permission: string | undefined = chapter?.permissions?.[this.userService.currentUserId];
    return permission == null ? false : permission === TextInfoPermission.Write;
  }

  async ngOnInit(): Promise<void> {
    this.targetProjectId = this.activatedProjectService.projectId!;
    this.targetProject = this.activatedProjectService.projectDoc?.data;
    this.sourceProjectId = this.targetProject?.translateConfig.source?.projectRef!;
    this.projectSettingsUrl = `/projects/${this.activatedProjectService.projectId}/settings`;
    this.books = this.targetProject?.texts.map(t => t.bookNum).sort((a, b) => a - b) ?? [];

    if (this.sourceProjectId) {
      this.sourceProject = (await this.projectService.getProfile(this.sourceProjectId)).data;
    }

    // Wait to populate draft until target editor is loaded with current chapter
    this.subscribe(
      this.targetEditor.loaded.pipe(
        tap(() => {
          this.draftPopulated = false;
        }),
        // Listen for online status changes once the editor loads
        switchMap(() => this.onlineStatusService.onlineStatus$)
      ),
      (online: boolean) => {
        this.isOnline = online;

        // Populate just once per editor load
        if (online && !this.draftPopulated) {
          this.populateDraftText();
        }
      }
    );

    // Set book/chapter from route, or first book/chapter if not provided
    this.subscribe(this.activatedRoute.paramMap, (params: ParamMap) => {
      const bookId: string | null = params.get('bookId');
      const book: number = bookId ? Canon.bookIdToNumber(bookId) : this.books[0];

      this.setBook(book, Number(params.get('chapter')));
    });
  }

  setBook(book: number, chapter?: number): void {
    // If book is not in project, navigate to first book of project
    if (!this.books.some(b => b === book)) {
      this.navigateBookChapter(this.books[0], 1, { replaceUrl: true });
      return;
    }

    this.currentBook = book;
    this.chapters = this.targetProject?.texts?.find(t => t.bookNum === book)?.chapters.map(c => c.number) ?? [];

    // Navigate to first included chapter of book if specified chapter is not included in book
    if (chapter != null && !this.chapters.includes(chapter)) {
      this.navigateBookChapter(book, this.chapters[0], { replaceUrl: true });
      return;
    }

    this.setChapter(chapter ?? this.chapters[0]);
  }

  setChapter(chapter: number): void {
    if (this.currentBook == null) {
      throw new Error(`'setChapter()' called when 'currentBook' is not set`);
    }

    this.currentChapter = chapter;

    // Editor TextDocId needs to be set before it is created
    this.targetTextDocId = new TextDocId(this.targetProjectId, this.currentBook, this.currentChapter, 'target');

    if (this.sourceProjectId) {
      this.sourceTextDocId = new TextDocId(this.sourceProjectId, this.currentBook, this.currentChapter, 'target');
      this.bookHasSource = this.targetProject?.texts.find(t => t.bookNum === this.currentBook)?.hasSource ?? false;
    }
  }

  populateDraftText(): void {
    this.draftPopulated = true;
    this.hasDraft = false;
    this.isDraftApplied = false;
    this.preDraftTargetDelta = this.targetEditor.editor?.getContents();

    if (this.currentBook == null || this.currentChapter == null || !this.preDraftTargetDelta?.ops) {
      return;
    }

    this.draftGenerationService
      .getGeneratedDraft(this.targetProjectId!, this.currentBook, this.currentChapter)
      .pipe(
        filter((draft: DraftSegmentMap) => {
          this.hasDraft = this.draftViewerService.hasDraftOps(draft, this.preDraftTargetDelta!.ops!);

          return this.hasDraft;
        }),
        map((draft: DraftSegmentMap) => this.draftViewerService.toDraftOps(draft, this.preDraftTargetDelta!.ops!))
      )
      .subscribe((draftOps: DeltaOperation[]) => {
        // Set the draft editor with the pre-translation segments
        this.targetEditor.editor?.setContents(new Delta(draftOps), 'api');
      });
  }

  applyDraft(): void {
    if (this.preDraftTargetDelta?.ops == null) {
      throw new Error(`'applyDraft()' called when 'preDraftTargetDelta' is not set`);
    }

    if (this.targetEditor.editor == null) {
      throw new Error(`'applyDraft()' called when 'targetEditor.editor' is not set`);
    }

    const cleanedOps: DeltaOperation[] = this.cleanDraftOps(this.targetEditor.editor.getContents().ops!);
    const diff: DeltaStatic = this.preDraftTargetDelta.diff(new Delta(cleanedOps));

    // Set content back to original to prepare for update with diff
    this.targetEditor.editor.setContents(this.preDraftTargetDelta, 'silent');

    // Call updateContents() with diff instead of setContents() with entire contents because
    // setContents() is causing a 'delete' op to be appended because of the final '\n'.
    // This delete op is persisted and triggers the 'corrupted data' notice back in the editor component.
    this.targetEditor.editor.enable(true);
    this.targetEditor.editor.updateContents(diff, 'user');
    this.targetEditor.editor.disable();

    this.isDraftApplied = true;
  }

  // Remove draft flag from attributes
  cleanDraftOps(draftOps: DeltaOperation[]): DeltaOperation[] {
    draftOps.forEach((op: DeltaOperation) => {
      delete op.attributes?.draft;
    });
    return draftOps;
  }

  // Navigate to editor component for editing this book/chapter
  editChapter(): void {
    this.router.navigateByUrl(
      `/projects/${this.targetProjectId}/translate/${Canon.bookNumberToId(this.currentBook!)}/${this.currentChapter}`
    );
  }

  navigateBookChapter(book: number, chapter: number, options?: NavigationBehaviorOptions): void {
    this.router.navigateByUrl(
      `/projects/${this.targetProjectId}/draft-preview/${Canon.bookNumberToId(book)}/${chapter}`,
      options
    );
  }

  // Book/chapter chooser book changed
  onBookChange(book: number): void {
    // When user changes book, always navigate to the first chapter of the book
    this.navigateBookChapter(book, 1);
  }

  // Book/chapter chooser chapter changed
  onChapterChange(chapter: number): void {
    this.navigateBookChapter(this.currentBook!, chapter);
  }
}
