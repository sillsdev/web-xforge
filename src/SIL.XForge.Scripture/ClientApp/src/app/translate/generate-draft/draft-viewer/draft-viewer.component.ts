import { AfterViewInit, ChangeDetectionStrategy, Component, QueryList, ViewChild, ViewChildren } from '@angular/core';
import isString from 'lodash-es/isString';
import { DeltaOperation } from 'quill';
import { Subject } from 'rxjs';
import { map, switchMap, tap, withLatestFrom } from 'rxjs/operators';
import { Delta, TextDocId } from 'src/app/core/models/text-doc';
import { TextComponent } from 'src/app/shared/text/text.component';
import { ActivatedProjectService } from '../../../../xforge-common/activated-project.service';
import { DraftGenerationService, DraftSegmentMap } from '../draft-generation.service';

@Component({
  selector: 'app-draft-viewer',
  templateUrl: './draft-viewer.component.html',
  styleUrls: ['./draft-viewer.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DraftViewerComponent implements AfterViewInit {
  @ViewChild('draftText') draftEditor!: TextComponent;

  // Use ViewChildren even though there is only one in order to have observable
  // notice when it enters the dom.
  @ViewChildren('targetText') targetEditorQueryList!: QueryList<TextComponent>;

  targetEditor!: TextComponent;

  books: number[] = [];
  currentBook?: number;

  currentChapter?: number;
  chapters: number[] = [];

  targetProjectName?: string = this.activatedProjectService.projectDoc?.data?.name;
  isRtl: boolean = this.activatedProjectService.projectDoc?.data?.isRightToLeft ?? false;
  targetTextDocId?: TextDocId;

  chapterSet$ = new Subject();

  constructor(
    private readonly draftGenerationService: DraftGenerationService,
    private readonly activatedProjectService: ActivatedProjectService
  ) {}

  ngAfterViewInit(): void {
    // Wait to populate draft until editor is loaded and a book and chapter are selected
    this.targetEditorQueryList.changes
      .pipe(
        tap((list: QueryList<TextComponent>) => (this.targetEditor = list.first)),
        switchMap((list: QueryList<TextComponent>) => list.first.loaded),
        withLatestFrom(this.chapterSet$)
      )
      .subscribe(() => {
        this.populateDraftText();
      });

    this.books = this.activatedProjectService.projectDoc?.data?.texts.map(t => t.bookNum) ?? [];
    this.setBook(this.books[0]);
  }

  setBook(book: number): void {
    this.currentBook = book;
    this.chapters =
      this.activatedProjectService.projectDoc?.data?.texts
        ?.find(t => t.bookNum === book)
        ?.chapters.map(c => c.number) ?? [];

    this.setChapter(this.chapters[0]);
  }

  setChapter(chapter: number): void {
    if (!this.currentBook) {
      throw new Error(`'setChapter()' called when 'currentBook' is not set`);
    }

    this.currentChapter = chapter;

    // Editor TextDocId needs to be set before it is created
    this.targetTextDocId = new TextDocId(
      this.activatedProjectService.projectId!,
      this.currentBook,
      this.currentChapter,
      'target'
    );

    // Notify so draft population can start once editor is loaded
    this.chapterSet$.next();
  }

  populateDraftText(): void {
    if (!this.currentBook || !this.currentChapter) {
      throw new Error(`'populateDraftText()' called when 'currentBook' or 'currentChapter' is not set`);
    }

    this.draftGenerationService
      .getGeneratedDraft(this.activatedProjectService.projectId!, this.currentBook, this.currentChapter)
      .pipe(map(this.toDraftOps.bind(this)))
      .subscribe((draftOps: DeltaOperation[]) => {
        // Set the draft editor with the pre-translation segments
        this.draftEditor.editor?.setContents(new Delta(draftOps), 'api');
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
    this.targetEditor.editor?.enable(true);
    this.targetEditor.editor?.setContents(this.draftEditor.editor?.getContents()!, 'user');
    this.targetEditor.editor?.disable();
  }
}
