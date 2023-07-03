import { Injectable } from '@angular/core';
import { isEmpty } from 'lodash-es';
import isString from 'lodash-es/isString';
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
      const draftSegmentText = draft[op.attributes?.segment];

      // Draft text exists for segment that has no existing translation
      return draftSegmentText && !(isString(op.insert) && op.insert.trim());
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
}
