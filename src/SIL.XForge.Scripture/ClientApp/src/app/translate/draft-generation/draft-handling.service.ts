import { Injectable } from '@angular/core';
import { VerseRef } from '@sillsdev/scripture';
import { Delta } from 'quill';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { DeltaOperation } from 'rich-text';
import { catchError, Observable, throwError } from 'rxjs';
import { ErrorReportingService } from 'xforge-common/error-reporting.service';
import { isString } from '../../../type-utils';
import { TextDocId } from '../../core/models/text-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { TextDocService } from '../../core/text-doc.service';
import { getVerseRefFromSegmentRef, isBadDelta, verseSlug } from '../../shared/utils';
import { DraftSegmentMap } from './draft-generation';
import { DraftGenerationService } from './draft-generation.service';

export interface DraftMappingOptions {
  overwrite?: boolean;
}

export interface DraftDiff {
  id: TextDocId;
  ops: Delta;
}

@Injectable({
  providedIn: 'root'
})
export class DraftHandlingService {
  constructor(
    private readonly projectService: SFProjectService,
    private readonly textDocService: TextDocService,
    private readonly draftGenerationService: DraftGenerationService,
    private readonly errorReportingService: ErrorReportingService
  ) {}

  /**
   * Whether draft has any pretranslation segments that are not already translated in target ops.
   * @param draft dictionary of segment refs to pretranslations
   * @param targetOps current delta ops for target editor
   */
  hasDraftOps(draft: DraftSegmentMap, targetOps: DeltaOperation[]): boolean {
    // Check for empty draft
    if (Object.keys(draft).length === 0) {
      return false;
    }

    return targetOps.some(op => {
      if (op.insert == null) {
        return false;
      }

      const draftSegmentText: string | undefined = draft[op.attributes?.segment as string];
      const isSegmentDraftAvailable = draftSegmentText != null && draftSegmentText.trim().length > 0;

      // Can populate draft if insert is a blank string OR insert is object that has 'blank: true' property.
      // Other objects are not draftable (e.g. 'note-thread-embed').
      const isInsertBlank =
        (isString(op.insert) && op.insert.trim().length === 0) || (!isString(op.insert) && op.insert.blank === true);

      return isSegmentDraftAvailable && isInsertBlank;
    });
  }

  /**
   * Returns array of target ops with draft pretranslation copied
   * to corresponding target op segments that are not already translated.
   * @param draft dictionary of segment refs to pretranslations
   * @param targetOps current delta ops for target editor
   */
  toDraftOps(draft: DraftSegmentMap, targetOps: DeltaOperation[], options?: DraftMappingOptions): DeltaOperation[] {
    // Check for empty draft
    if (Object.keys(draft).length === 0) {
      return targetOps;
    }

    const overwrite = options?.overwrite ?? false;

    return targetOps.map(op => {
      const segmentRef: string | undefined = op.attributes?.segment as string | undefined;
      if (segmentRef == null) return op;
      let draftSegmentText: string | undefined = draft[segmentRef];
      let isSegmentDraftAvailable = draftSegmentText != null && draftSegmentText.trim().length > 0;

      // No draft (undefined or empty string) for this segment
      if (!isSegmentDraftAvailable) {
        // See if the source verse is combined
        // Note: this will work with combining 1 and 1-2, and 1-3 and 1-2 with the proviso that verse 3 is not merged
        const combinedVerseNumbers: string[] = Object.keys(draft).filter(key =>
          key.startsWith(segmentRef.split('-')[0] + '-')
        );
        if (combinedVerseNumbers.length > 0) {
          // Place the combined verse segment in the verse segment
          draftSegmentText = draft[combinedVerseNumbers[0]];
          isSegmentDraftAvailable = draftSegmentText != null && draftSegmentText.trim().length > 0;
        } else if (segmentRef.startsWith('verse_') && segmentRef.indexOf('-') > -1) {
          // Otherwise, if the target verse is combined
          // Get the verse ref from the segment. We don't use the book number, so just specify Genesis
          const segmentVerseRef: VerseRef | undefined = getVerseRefFromSegmentRef(1, segmentRef);
          if (segmentVerseRef != null) {
            // Add the drafts for all of the verses in the segment
            for (const verseRef of segmentVerseRef?.allVerses()) {
              if (draftSegmentText == null) {
                draftSegmentText = '';
              } else if (draftSegmentText[draftSegmentText.length - 1] !== ' ') {
                draftSegmentText += ' ';
              }
              if (draft[verseSlug(verseRef)] != null) {
                draftSegmentText += draft[verseSlug(verseRef)];
              }
            }
            isSegmentDraftAvailable = draftSegmentText != null && draftSegmentText.trim().length > 0;
          }
        }

        // Use the existing translation, if there is still no draft available
        if (!isSegmentDraftAvailable) {
          return op;
        }
      }

      if (isString(op.insert)) {
        if (!overwrite && op.insert.trim().length > 0) {
          // 'insert' is non-blank string; use existing translation
          return op;
        }
      } else if (op.insert?.blank !== true) {
        // 'insert' is an object that is not draftable (e.g. 'note-thread-embed'); use existing translation
        return op;
      }

      // Otherwise, populate op with pre-translation
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

  /**
   * Gets the generated draft of a chapter for a book. If unable to get the current draft delta format,
   * it will automatically fallback to attempt to retrieve the legacy draft format.
   * @param textDocId The text document identifier.
   * @param param1 Whether to get the draft in the legacy format.
   * @returns The draft data in the current delta operation format or the legacy segment map format.
   */
  getDraft(
    textDocId: TextDocId,
    { isDraftLegacy, timestamp }: { isDraftLegacy: boolean; timestamp?: Date }
  ): Observable<DeltaOperation[] | DraftSegmentMap> {
    return isDraftLegacy
      ? // Fetch legacy draft
        this.draftGenerationService.getGeneratedDraft(textDocId.projectId, textDocId.bookNum, textDocId.chapterNum)
      : // Fetch draft in Delta format (fallback to legacy)
        this.draftGenerationService
          .getGeneratedDraftDeltaOperations(textDocId.projectId, textDocId.bookNum, textDocId.chapterNum, timestamp)
          .pipe(
            catchError(err => {
              // If the corpus does not support USFM, use the legacy format.
              // The legacy format does not support a timestamp
              if (err.status === 405 && timestamp == null) {
                return this.getDraft(textDocId, { isDraftLegacy: true, timestamp });
              }

              return throwError(() => err);
            })
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
    const lastVerse: number = verseOps.length > 0 ? (verseOps[verseOps.length - 1].insert!['verse']['number'] ?? 0) : 0;
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
   * Retrieves and applies the draft to the text document.
   * @param project The project profile.
   * @param draftTextDocId The text doc identifier of the draft of a chapter.
   * @param targetTextDocId The text doc identifier to apply the draft to.
   * @returns True if the draft was successfully applied, false if the draft was not applied i.e. the draft
   * was in the legacy USFM format.
   */
  async getAndApplyDraftAsync(
    project: SFProjectProfile,
    draftTextDocId: TextDocId,
    targetTextDocId: TextDocId,
    timestamp?: Date
  ): Promise<boolean> {
    if (!this.textDocService.canEdit(project, draftTextDocId.bookNum, draftTextDocId.chapterNum)) {
      return false;
    }

    return await new Promise<boolean>(resolve => {
      this.getDraft(draftTextDocId, { isDraftLegacy: false, timestamp }).subscribe({
        next: async draft => {
          let ops: DeltaOperation[] = [];
          if (this.isDraftSegmentMap(draft)) {
            // Do not support applying drafts for the legacy segment map format.
            // This can be applied chapter by chapter.
            resolve(false);
            return;
          } else {
            ops = draft;
          }
          const draftDelta: Delta = new Delta(ops);
          await this.applyChapterDraftAsync(targetTextDocId, draftDelta).catch(err => {
            // report the error to bugsnag
            this.errorReportingService.silentError('Error applying a draft', ErrorReportingService.normalizeError(err));
            resolve(false);
          });
          resolve(true);
        },
        error: err => {
          // report the error to bugsnag
          this.errorReportingService.silentError('Error applying a draft', ErrorReportingService.normalizeError(err));
          resolve(false);
        }
      });
    });
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
    const onlyTextOpIsTrailingNewline = indexOfFirstText === ops.length - 1 && ops[indexOfFirstText].insert === '\n';
    const hasNoExistingText = indexOfFirstText === -1 || onlyTextOpIsTrailingNewline;
    return !hasNoExistingText;
  }

  draftDataToOps(ops: DeltaOperation[] | DraftSegmentMap, targetOps: DeltaOperation[]): DeltaOperation[] {
    // Convert the legacy draft format to ops
    if (this.isDraftSegmentMap(ops)) {
      return this.toDraftOps(ops, targetOps);
    }
    return ops;
  }

  isDraftSegmentMap(draft: DeltaOperation[] | DraftSegmentMap): draft is DraftSegmentMap {
    return !Array.isArray(draft);
  }
}
