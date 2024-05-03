import { Injectable } from '@angular/core';
import { VerseRef } from '@sillsdev/scripture';
import { DeltaOperation, DeltaStatic } from 'quill';
import { TextDocId } from 'src/app/core/models/text-doc';
import { isString } from '../../../../type-utils';
import { getVerseRefFromSegmentRef, verseSlug } from '../../../shared/utils';
import { DraftSegmentMap } from '../draft-generation';

export interface DraftMappingOptions {
  overwrite?: boolean;
}

export interface DraftDiff {
  id: TextDocId;
  ops: DeltaStatic;
}

@Injectable({
  providedIn: 'root'
})
export class DraftViewerService {
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

      const draftSegmentText: string | undefined = draft[op.attributes?.segment];
      const isSegmentDraftAvailable = draftSegmentText != null && draftSegmentText.trim().length > 0;

      // Can populate draft if insert is a blank string OR insert is object that has 'blank: true' property.
      // Other objects are not draftable (e.g. 'note-thread-embed').
      const isInsertBlank = (isString(op.insert) && op.insert.trim().length === 0) || op.insert.blank === true;

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
      const segmentRef: string | undefined = op.attributes?.segment;
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
          let segmentVerseRef: VerseRef | undefined = getVerseRefFromSegmentRef(1, segmentRef);
          if (segmentVerseRef != null) {
            // Add the drafts for all of the verses in the segment
            for (var verseRef of segmentVerseRef?.allVerses()) {
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
}
