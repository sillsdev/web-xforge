import { Injectable } from '@angular/core';
import { isEmpty, isString } from 'lodash-es';
import { DeltaOperation } from 'quill';
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
    if (isEmpty(draft)) {
      return false;
    }

    return targetOps.some(op => {
      const draftSegmentText: string | undefined = draft[op.attributes?.segment];

      // No draft (undefined or empty string) for this segment; can't populate draft
      if (isEmpty(draftSegmentText?.trim())) {
        return false;
      }

      // Can populate draft if insert is a blank string
      if (isString(op.insert)) {
        return isEmpty(op.insert.trim());
      }

      // Can populate draft if insert is object that has 'blank: true' property.
      // Other objects are not draftable (e.g. 'note-thread-embed').
      return op.insert?.blank === true;
    });
  }

  /**
   * Returns array of target ops with draft pretranslation copied
   * to corresponding target op segments that are not already translated.
   * @param draft dictionary of segment refs to pretranslations
   * @param targetOps current delta ops for target editor
   */
  toDraftOps(draft: DraftSegmentMap, targetOps: DeltaOperation[]): DeltaOperation[] {
    if (isEmpty(draft)) {
      return targetOps;
    }

    return targetOps.map(op => {
      const draftSegmentText: string | undefined = draft[op.attributes?.segment];

      // No draft (undefined or empty string) for this segment; use any existing translation
      if (isEmpty(draftSegmentText?.trim())) {
        return op;
      }

      if (isString(op.insert)) {
        if (!isEmpty(op.insert.trim())) {
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
