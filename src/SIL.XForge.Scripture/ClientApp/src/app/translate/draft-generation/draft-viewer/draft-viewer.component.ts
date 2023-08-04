import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  QueryList,
  ViewChild,
  ViewChildren
} from '@angular/core';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { Canon } from '@sillsdev/scripture';
import { DeltaOperation, DeltaStatic } from 'quill';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { of, zip } from 'rxjs';
import { filter, map, switchMap } from 'rxjs/operators';
import { Delta, TextDocId } from 'src/app/core/models/text-doc';
import { SFProjectService } from 'src/app/core/sf-project.service';
import { TextComponent } from 'src/app/shared/text/text.component';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DraftSegmentMap } from '../draft-generation';
import { DraftGenerationService } from '../draft-generation.service';
import { DraftViewerService } from './draft-viewer.service';

@Component({
  selector: 'app-draft-viewer',
  templateUrl: './draft-viewer.component.html',
  styleUrls: ['./draft-viewer.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DraftViewerComponent implements OnInit, AfterViewInit {
  @ViewChild('sourceText') sourceEditor?: TextComponent; // Vernacular (source might not be set in project settings)
  @ViewChild('targetText') targetEditor!: TextComponent; // Already translated interleaved with draft

  // ViewChildren gives observable notice when editors enter dom
  @ViewChildren('sourceText, targetText') targetEditorQueryList!: QueryList<TextComponent>;

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

  projectSettingsUrl?: string;
  preDraftTargetDelta?: DeltaStatic;

  constructor(
    private readonly draftGenerationService: DraftGenerationService,
    private readonly draftViewerService: DraftViewerService,
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly projectService: SFProjectService,
    private readonly activatedRoute: ActivatedRoute,
    private readonly router: Router,
    private readonly changeDetectorRef: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    this.targetProjectId = this.activatedProjectService.projectId!;
    this.targetProject = this.activatedProjectService.projectDoc?.data;
    this.sourceProjectId = this.targetProject?.translateConfig.source?.projectRef!;
    this.projectSettingsUrl = `/projects/${this.activatedProjectService.projectId}/settings`;

    if (this.sourceProjectId) {
      this.sourceProject = (await this.projectService.getProfile(this.sourceProjectId)).data;
    }
  }

  ngAfterViewInit(): void {
    // Wait to populate draft until both editors are loaded with current chapter
    this.targetEditorQueryList.changes
      .pipe(switchMap(() => zip(this.sourceEditor?.loaded ?? of(null), this.targetEditor.loaded)))
      .subscribe(() => {
        // Both editors are now loaded (or just target is loaded if no source text set in project settings)
        this.isDraftApplied = false;
        this.preDraftTargetDelta = this.targetEditor.editor?.getContents();
        this.populateDraftText();
      });

    this.books = this.targetProject?.texts.map(t => t.bookNum) ?? [];

    // Set book/chapter from route, or first book/chapter if not provided
    this.activatedRoute.paramMap.subscribe((params: ParamMap) => {
      const bookId: string | null = params.get('bookId');
      const book: number = bookId ? Canon.bookIdToNumber(bookId) : this.books[0];
      this.setBook(book, Number(params.get('chapter')));
    });
  }

  setBook(book: number, chapter?: number): void {
    this.currentBook = book;
    this.chapters = this.targetProject?.texts?.find(t => t.bookNum === book)?.chapters.map(c => c.number) ?? [];

    // Navigate to first included chapter of book if specified chapter is not included in book
    if (chapter != null && !this.chapters.includes(chapter)) {
      this.navigateBookChapter(book, this.chapters[0]);
      return;
    }

    this.setChapter(chapter || this.chapters[0]);
  }

  setChapter(chapter: number): void {
    if (!this.currentBook) {
      throw new Error(`'setChapter()' called when 'currentBook' is not set`);
    }

    this.currentChapter = chapter;

    // Editor TextDocId needs to be set before it is created
    this.targetTextDocId = new TextDocId(this.targetProjectId, this.currentBook, this.currentChapter, 'target');

    if (this.sourceProjectId) {
      this.sourceTextDocId = new TextDocId(this.sourceProjectId, this.currentBook, this.currentChapter, 'target');
    }
  }

  populateDraftText(): void {
    if (!this.currentBook || !this.currentChapter) {
      throw new Error(`'populateDraftText()' called when 'currentBook' or 'currentChapter' is not set`);
    }

    if (!this.preDraftTargetDelta?.ops) {
      throw new Error(`'populateDraftText()' called when 'preDraftTargetDelta' is not set`);
    }

    this.draftGenerationService
      .getGeneratedDraft(this.targetProjectId!, this.currentBook, this.currentChapter)
      .pipe(
        filter((draft: DraftSegmentMap) => {
          this.hasDraft = this.draftViewerService.hasDraftOps(draft, this.preDraftTargetDelta!.ops!);

          // Needed to trigger OnPush change detection because service response
          // occurs after change detection due to component event emission
          this.changeDetectorRef.markForCheck();

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

    const cleanedOps: DeltaOperation[] = this.cleanDraftOps(this.targetEditor.editor?.getContents().ops!);
    const diff: DeltaStatic = this.preDraftTargetDelta.diff(new Delta(cleanedOps));

    // Set content back to original to prepare for update with diff
    this.targetEditor.editor?.setContents(this.preDraftTargetDelta!, 'silent');

    // Call updateContents() with diff instead of setContents() with entire contents because
    // setContents() is causing a 'delete' op to be appended because of the final '\n'.
    // This delete op is persisted and triggers the 'corrupted data' notice back in the editor component.
    this.targetEditor.editor?.enable(true);
    this.targetEditor.editor?.updateContents(diff, 'user');
    this.targetEditor.editor?.disable();

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

  // Book/chapter chooser navigate book/chapter for this component
  navigateBookChapter(book: number, chapter: number): void {
    this.router.navigateByUrl(
      `/projects/${this.targetProjectId}/draft-preview/${Canon.bookNumberToId(book)}/${chapter}`
    );
  }

  // Book/chapter chooser book changed
  onBookChange(book: number): void {
    // When user changes book, always navigate to the first chapter of the book
    this.router.navigateByUrl(`/projects/${this.targetProjectId}/draft-preview/${Canon.bookNumberToId(book)}/1`);
  }

  // Book/chapter chooser chapter changed
  onChapterChange(chapter: number): void {
    this.router.navigateByUrl(
      `/projects/${this.targetProjectId}/draft-preview/${Canon.bookNumberToId(this.currentBook!)}/${chapter}`
    );
  }
}
