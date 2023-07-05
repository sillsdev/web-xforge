import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  OnInit,
  QueryList,
  ViewChild,
  ViewChildren
} from '@angular/core';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { DeltaOperation } from 'quill';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { Canon } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/canon';
import { zip } from 'rxjs';
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
  @ViewChild('sourceText') sourceEditor!: TextComponent; // Vernacular
  @ViewChild('targetText') targetEditor!: TextComponent; // Already translated interleaved with draft

  // ViewChildren gives observable notice when editors enter dom
  @ViewChildren('sourceText, targetText') targetEditorQueryList!: QueryList<TextComponent>;

  books: number[] = [];
  currentBook?: number;

  chapters: number[] = [];
  currentChapter?: number;

  sourceProjectId!: string;
  targetProjectId!: string;

  sourceProject?: SFProjectProfile;
  targetProject?: SFProjectProfile;

  sourceTextDocId?: TextDocId;
  targetTextDocId?: TextDocId;

  isDraftApplied = false;
  hasDraft = false;

  constructor(
    private readonly draftGenerationService: DraftGenerationService,
    private readonly draftViewerService: DraftViewerService,
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly projectService: SFProjectService,
    private readonly activatedRoute: ActivatedRoute,
    private readonly router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    this.targetProjectId = this.activatedProjectService.projectId!;
    this.targetProject = this.activatedProjectService.projectDoc?.data;

    this.sourceProjectId = this.targetProject?.translateConfig.source?.projectRef!;
    this.sourceProject = (await this.projectService.getProfile(this.sourceProjectId)).data;
  }

  ngAfterViewInit(): void {
    // Wait to populate draft until both editors are loaded with current chapter
    this.targetEditorQueryList.changes
      .pipe(switchMap(() => zip(this.sourceEditor.loaded, this.targetEditor.loaded)))
      .subscribe(() => {
        // Both editors are now loaded
        this.isDraftApplied = false;
        this.populateDraftText();
      });

    this.books = this.targetProject?.texts.map(t => t.bookNum) ?? [];

    // Set book/chapter from route, or first book/chapter if not provided
    this.activatedRoute.paramMap.subscribe((params: ParamMap) => {
      const bookId = params.get('bookId');
      const book = bookId ? Canon.bookIdToNumber(bookId) : this.books[0];
      this.setBook(book, Number(params.get('chapter')));
    });
  }

  setBook(book: number, chapter?: number): void {
    this.currentBook = book;
    this.chapters = this.targetProject?.texts?.find(t => t.bookNum === book)?.chapters.map(c => c.number) ?? [];

    this.setChapter(chapter || this.chapters[0]);
  }

  setChapter(chapter: number): void {
    if (!this.currentBook) {
      throw new Error(`'setChapter()' called when 'currentBook' is not set`);
    }

    this.currentChapter = chapter;

    // Editor TextDocId needs to be set before it is created
    this.sourceTextDocId = new TextDocId(this.sourceProjectId, this.currentBook, this.currentChapter, 'target');
    this.targetTextDocId = new TextDocId(this.targetProjectId, this.currentBook, this.currentChapter, 'target');
  }

  populateDraftText(): void {
    if (!this.currentBook || !this.currentChapter) {
      throw new Error(`'populateDraftText()' called when 'currentBook' or 'currentChapter' is not set`);
    }

    const targetOps = this.targetEditor.editor?.getContents().ops!;

    this.draftGenerationService
      .getGeneratedDraft(this.targetProjectId!, this.currentBook, this.currentChapter)
      .pipe(
        filter((draft: DraftSegmentMap) => (this.hasDraft = this.draftViewerService.hasDraftOps(draft, targetOps))),
        map((draft: DraftSegmentMap) => this.draftViewerService.toDraftOps(draft, targetOps))
      )
      .subscribe((draftOps: DeltaOperation[]) => {
        // Set the draft editor with the pre-translation segments
        this.targetEditor.editor?.setContents(new Delta(draftOps), 'api');
      });
  }

  applyDraft(): void {
    const cleanedOps = this.cleanDraftOps(this.targetEditor.editor?.getContents().ops!);

    this.targetEditor.editor?.enable(true);

    // TODO - Set action source to 'user' to actually apply draft
    // this.targetEditor.editor?.setContents(new Delta(cleanedOps)!, 'user');
    this.targetEditor.editor?.setContents(new Delta(cleanedOps)!, 'api');

    this.targetEditor.editor?.disable();
    this.isDraftApplied = true;
  }

  // Remove draft flag from attributes
  cleanDraftOps(draftOps: DeltaOperation[]): DeltaOperation[] {
    draftOps.forEach(op => {
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
}
