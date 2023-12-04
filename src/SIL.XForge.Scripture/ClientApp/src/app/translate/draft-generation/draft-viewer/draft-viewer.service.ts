import { Injectable } from '@angular/core';
import { DeltaOperation } from 'quill';
import { isString } from '../../../../type-utils';
import { DraftSegmentMap } from '../draft-generation';

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
  toDraftOps(draft: DraftSegmentMap, targetOps: DeltaOperation[]): DeltaOperation[] {
    // Check for empty draft
    if (Object.keys(draft).length === 0) {
      return targetOps;
    }

    return targetOps.map(op => {
      let draftSegmentText: string | undefined = draft[op.attributes?.segment];
      let isSegmentDraftAvailable = draftSegmentText != null && draftSegmentText.trim().length > 0;

      // No draft (undefined or empty string) for this segment
      if (!isSegmentDraftAvailable) {
        // See if the source verse is combined
        const combinedVerseNumbers: string[] = Object.keys(draft).filter(key =>
          key.startsWith(op.attributes?.segment + '-')
        );
        if (combinedVerseNumbers.length > 0) {
          // Place the combined verse segment in the verse segment
          draftSegmentText = draft[combinedVerseNumbers[0]];
          isSegmentDraftAvailable = draftSegmentText != null && draftSegmentText.trim().length > 0;
        } else {
          // Use the existing translation
          return op;
        }
      }

      if (isString(op.insert)) {
        if (op.insert.trim().length > 0) {
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
}
