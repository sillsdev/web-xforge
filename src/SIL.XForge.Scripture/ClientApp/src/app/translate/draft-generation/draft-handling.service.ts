import { Injectable } from '@angular/core';
import { Delta } from 'quill';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { DraftUsfmConfig } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { DeltaOperation } from 'rich-text';
import { Observable } from 'rxjs';
import { TextDocId } from '../../core/models/text-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { TextDocService } from '../../core/text-doc.service';
import { isBadDelta } from '../../shared/utils';
import { DraftGenerationService } from './draft-generation.service';

const VERSE_NUM_REGEX = /(\d+)\w?$/;

@Injectable({
  providedIn: 'root'
})
export class DraftHandlingService {
  constructor(
    private readonly projectService: SFProjectService,
    private readonly textDocService: TextDocService,
    private readonly draftGenerationService: DraftGenerationService
  ) {}

  /**
   * Gets the generated draft of a chapter for a book.
   * @param textDocId The text document identifier.
   * @param timestamp Whether to use the snapshot stored in the database at a timestamp.
   * @param config The format configuration to access the draft. Providing this will return a draft from serval.
   * @returns The draft data in the current delta operation format.
   */
  getDraft(
    textDocId: TextDocId,
    { timestamp, config }: { timestamp?: Date; config?: DraftUsfmConfig }
  ): Observable<DeltaOperation[]> {
    return this.draftGenerationService.getGeneratedDraftDeltaOperations(
      textDocId.projectId,
      textDocId.bookNum,
      textDocId.chapterNum,
      timestamp,
      config
    );
  }

  getBookDraft(
    textDocId: TextDocId,
    { timestamp, config }: { timestamp?: Date; config?: DraftUsfmConfig }
  ): Observable<Map<string, DeltaOperation[]>> {
    return this.draftGenerationService.getGeneratedDraftBookDeltaOperations(
      textDocId.projectId,
      textDocId.bookNum,
      timestamp,
      config
    );
  }

  canApplyDraft(
    targetProject: SFProjectProfile,
    bookNum: number,
    chapterNum: number,
    draftOps: DeltaOperation[]
  ): boolean {
    return (
      this.textDocService.userHasGeneralEditRight(targetProject) &&
      this.textDocService.hasChapterEditPermission(targetProject, bookNum, chapterNum) &&
      this.textDocService.isDataInSync(targetProject) &&
      !this.textDocService.isEditingDisabled(targetProject) &&
      !isBadDelta(draftOps)
    );
  }

  /**
   * Applies the draft to the text document.
   * @param textDocId The text doc identifier.
   * @param draftDelta The draft delta to overwrite the current text document with.
   */
  async applyChapterDraftAsync(textDocId: TextDocId, draftDelta: Delta): Promise<void> {
    const verseOps: DeltaOperation[] = draftDelta.ops.filter(
      op => typeof op.insert === 'object' && op.insert.verse != null
    );

    let lastVerse: number = 0;
    if (verseOps.length > 0 && verseOps[verseOps.length - 1].insert!['verse']['number'] != null) {
      let lastVerseStr: string = verseOps[verseOps.length - 1].insert!['verse']['number'].toString();
      const match: RegExpExecArray | null = VERSE_NUM_REGEX.exec(lastVerseStr);
      if (match != null) {
        lastVerseStr = match[1];
      }
      lastVerse = parseInt(lastVerseStr, 10);
    }
    await this.projectService.onlineSetDraftApplied(
      textDocId.projectId,
      textDocId.bookNum,
      textDocId.chapterNum,
      true,
      lastVerse
    );
    await this.projectService.onlineSetIsValid(textDocId.projectId, textDocId.bookNum, textDocId.chapterNum, true);
    await this.textDocService.overwrite(textDocId, draftDelta, 'Draft');
  }

  /**
   * Checks whether the ops have any content (text) in them. This is defined as any op having text content (verse
   * numbers and other format markers do not count as "content"). If the final op is a newline, it is not counted as
   * content since it appears most or all documents have a trailing newline at the end.
   * @param ops The list of delta operations to check for content.
   * @returns Whether any of the ops contains text content.
   */
  opsHaveContent(ops: DeltaOperation[]): boolean {
    const indexOfFirstText = ops.findIndex(op => typeof op.insert === 'string');
    const onlyTextOpIsTrailingNewline = indexOfFirstText === ops.length - 1 && ops[indexOfFirstText]?.insert === '\n';
    const hasNoExistingText = indexOfFirstText === -1 || onlyTextOpIsTrailingNewline;
    return !hasNoExistingText;
  }
}
