import { DestroyRef, Injectable } from '@angular/core';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { DraftUsfmConfig } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { DeltaOperation } from 'rich-text';
import { firstValueFrom } from 'rxjs';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { filterNullish, quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { TextDocId } from '../../core/models/text-doc';
import { TextDocService } from '../../core/text-doc.service';
import { isBadDelta } from '../../shared/utils';
import { DraftGenerationService } from './draft-generation.service';

@Injectable({
  providedIn: 'root'
})
export class DraftHandlingService {
  private readonly bookDraftCache = new Map<string, Map<string, DeltaOperation[]>>();

  constructor(
    private readonly textDocService: TextDocService,
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly draftGenerationService: DraftGenerationService,
    private readonly destroyRef: DestroyRef
  ) {
    this.activatedProjectService.changes$
      .pipe(quietTakeUntilDestroyed(this.destroyRef), filterNullish())
      // Clear the cache when a user navigates to a different project
      // or there is a change in the current project (e.g. change to the formatting options)
      .subscribe(() => this.clearBookDraftCache());
  }

  /**
   * Gets the generated drafts for every chapter of the book.
   * @param textDocId The text document identifier.
   * @param timestamp A timestamp indicating what version of the doc to fetch. Returns latest version if omitted.
   * @param config The format configuration to access the draft. Providing this will return a draft from serval.
   * @returns The draft data as a map of chapter number to delta operation array.
   */
  async getBookDraft(
    textDocId: TextDocId,
    { timestamp, config }: { timestamp?: Date; config?: DraftUsfmConfig }
  ): Promise<Map<string, DeltaOperation[]>> {
    if (config == null && timestamp != null) {
      const cachedDraft: Map<string, DeltaOperation[]> | undefined = this.bookDraftCache.get(
        this.getBookDraftKey(textDocId, timestamp)
      );
      if (cachedDraft != null) {
        return cachedDraft;
      }
    }

    const chapterDrafts = await firstValueFrom(
      this.draftGenerationService.getGeneratedDraftBookDeltaOperations(
        textDocId.projectId,
        textDocId.bookNum,
        timestamp,
        config
      )
    );
    if (config == null && timestamp != null) {
      this.bookDraftCache.set(this.getBookDraftKey(textDocId, timestamp), chapterDrafts);
    }

    return chapterDrafts;
  }

  canApplyDraft(
    targetProject: SFProjectProfile,
    bookNum: number,
    chapterNum: number,
    draftOps: DeltaOperation[]
  ): boolean {
    return (
      this.textDocService.userHasGeneralEditRight(targetProject) &&
      this.textDocService.hasChapterEditPermission(targetProject, bookNum, chapterNum) !== false &&
      this.textDocService.isDataInSync(targetProject) &&
      !this.textDocService.isEditingDisabled(targetProject) &&
      !isBadDelta(draftOps)
    );
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

  private clearBookDraftCache(): void {
    this.bookDraftCache.clear();
  }

  /**
   * Gets a key to use for caching the draft of a book.
   * @param textDocId The text doc identifier.
   * @param timestamp The timestamp of the draft.
   * @returns The string key to use for caching the draft of a book.
   */
  private getBookDraftKey(textDocId: TextDocId, timestamp: Date): string {
    const timestampKey: string = timestamp.toISOString();
    return `${textDocId.projectId}:${textDocId.bookNum}:${timestampKey}`;
  }
}
