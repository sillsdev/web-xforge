import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  OnInit,
  QueryList,
  ViewChild,
  ViewChildren
} from '@angular/core';
import isString from 'lodash-es/isString';
import { DeltaOperation } from 'quill';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { combineLatest, Subject } from 'rxjs';
import { map, switchMap, withLatestFrom } from 'rxjs/operators';
import { Delta, TextDocId } from 'src/app/core/models/text-doc';
import { SFProjectService } from 'src/app/core/sf-project.service';
import { TextComponent } from 'src/app/shared/text/text.component';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { I18nService } from 'xforge-common/i18n.service';
import { DraftGenerationService, DraftSegmentMap } from '../draft-generation.service';

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

  currentChapter?: number;
  chapters: number[] = [];

  sourceProjectId!: string;
  targetProjectId!: string;

  sourceProject?: SFProjectProfile;
  targetProject?: SFProjectProfile;

  sourceTextDocId?: TextDocId;
  targetTextDocId?: TextDocId;

  chapterSet$ = new Subject();
  isDraftApplied = false;

  constructor(
    private readonly draftGenerationService: DraftGenerationService,
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly projectService: SFProjectService,
    public readonly i18n: I18nService
  ) {}

  async ngOnInit(): Promise<void> {
    this.targetProjectId = this.activatedProjectService.projectId!;
    this.targetProject = this.activatedProjectService.projectDoc?.data;

    this.sourceProjectId = this.targetProject?.translateConfig.source?.projectRef!;
    this.sourceProject = (await this.projectService.getProfile(this.sourceProjectId)).data;
  }

  ngAfterViewInit(): void {
    // Wait to populate draft until editor is loaded and a book and chapter are selected
    this.targetEditorQueryList.changes
      .pipe(
        switchMap(() => combineLatest([this.sourceEditor.loaded, this.targetEditor.loaded])),
        withLatestFrom(this.chapterSet$)
      )
      .subscribe(() => {
        this.isDraftApplied = false;
        this.populateDraftText();
      });

    this.books = this.targetProject?.texts.map(t => t.bookNum) ?? [];
    this.setBook(this.books[0]);
  }

  setBook(book: number): void {
    this.currentBook = book;
    this.chapters = this.targetProject?.texts?.find(t => t.bookNum === book)?.chapters.map(c => c.number) ?? [];

    this.setChapter(this.chapters[0]);
  }

  setChapter(chapter: number): void {
    if (!this.currentBook) {
      throw new Error(`'setChapter()' called when 'currentBook' is not set`);
    }

    this.currentChapter = chapter;

    // Editor TextDocId needs to be set before it is created
    this.sourceTextDocId = new TextDocId(this.sourceProjectId, this.currentBook, this.currentChapter, 'target');
    this.targetTextDocId = new TextDocId(this.targetProjectId, this.currentBook, this.currentChapter, 'target');

    // Notify so draft population can start once editor is loaded
    this.chapterSet$.next();
  }

  populateDraftText(): void {
    if (!this.currentBook || !this.currentChapter) {
      throw new Error(`'populateDraftText()' called when 'currentBook' or 'currentChapter' is not set`);
    }

    this.draftGenerationService
      .getGeneratedDraft(this.targetProjectId!, this.currentBook, this.currentChapter)
      .pipe(map(this.toDraftOps.bind(this)))
      .subscribe((draftOps: DeltaOperation[]) => {
        // Set the draft editor with the pre-translation segments
        this.targetEditor.editor?.setContents(new Delta(draftOps), 'api');
      });
  }

  // Copy ops for draft from target, but substitute pre-translation segments when available and translation not done
  toDraftOps(draft: DraftSegmentMap): DeltaOperation[] {
    const currentTargetOps = this.targetEditor.editor?.getContents().ops ?? [];

    return currentTargetOps.map(op => {
      const draftSegmentText = draft[op.attributes?.segment];

      // Use any existing translation
      if (!draftSegmentText || (isString(op.insert) && op.insert.trim())) {
        return op;
      }

      // Otherwise, use pre-translation
      return {
        ...op,
        insert: draftSegmentText,
        attributes: {
          ...op.attributes,
          draft: true
        }
      };
    });
  }

  applyDraft(): void {
    const cleanedOps = this.cleanDraftOps(this.targetEditor.editor?.getContents().ops!);

    this.targetEditor.editor?.enable(true);

    // TODO - Set action source to 'user' to actually apply draft
    // this.targetEditor.editor?.setContents(new Delta(cleanedOps)!, 'user');
    this.targetEditor.editor?.setContents(new Delta(cleanedOps)!, 'api');

    this.targetEditor.editor?.disable();

    // TODO - Handle book/chapter that has no draft suggestions (let user know when done)
    this.isDraftApplied = true;
  }

  // Remove draft flag from attributes
  cleanDraftOps(draftOps: DeltaOperation[]): DeltaOperation[] {
    draftOps.forEach(op => {
      delete op.attributes?.draft;
    });
    return draftOps;
  }

  // TODO - Handle last book/chapter
  goNextDraftChapter(): void {
    // Next chapter in this book if current is not last
    const currentChapterIndex = this.chapters.indexOf(this.currentChapter!);
    if (currentChapterIndex !== this.chapters.length - 1) {
      this.setChapter(this.chapters[currentChapterIndex + 1]);
      return;
    }

    // Otherwise, go to next book
    const currentBookIndex = this.books.indexOf(this.currentBook!);
    if (currentBookIndex !== this.books.length - 1) {
      this.setBook(this.books[currentBookIndex + 1]);
    }
  }
}
