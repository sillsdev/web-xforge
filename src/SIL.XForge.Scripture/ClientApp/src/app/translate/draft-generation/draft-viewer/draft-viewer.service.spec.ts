import { TestBed } from '@angular/core/testing';
import { DeltaOperation } from 'rich-text';
import { DraftSegmentMap } from '../draft-generation';
import { DraftViewerService } from './draft-viewer.service';

describe('DraftViewerService', () => {
  let service: DraftViewerService;

  beforeAll(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DraftViewerService);
  });

  describe('hasDraftOps', () => {
    it('should return false if draft is empty', () => {
      const draft: DraftSegmentMap = {};
      const targetOps: DeltaOperation[] = [];
      const result: boolean = service.hasDraftOps(draft, targetOps);
      expect(result).toBeFalse();
    });

    it('should return false if all target ops have existing translation', () => {
      const draft: DraftSegmentMap = { verse_1_1: 'In the beginning' };
      const targetOps: DeltaOperation[] = [{ insert: 'existing translation', attributes: { segment: 'verse_1_1' } }];
      const result: boolean = service.hasDraftOps(draft, targetOps);
      expect(result).toBeFalse();
    });

    it('should return true if there is a target op without existing translation', () => {
      const draft: DraftSegmentMap = { verse_1_1: 'In the beginning' };
      const targetOps: DeltaOperation[] = [{ insert: '', attributes: { segment: 'verse_1_1' } }];
      const result: boolean = service.hasDraftOps(draft, targetOps);
      expect(result).toBeTrue();
    });
  });

  describe('toDraftOps', () => {
    it('should return target ops as-is if draft is empty', () => {
      const draft: DraftSegmentMap = {};
      const targetOps: DeltaOperation[] = [{ insert: 'existing translation', attributes: { segment: 'verse_1_1' } }];
      const result: DeltaOperation[] = service.toDraftOps(draft, targetOps);
      expect(result).toEqual(targetOps);
    });

    it('should return target ops with draft pretranslation copied', () => {
      const draft: DraftSegmentMap = { verse_1_1: 'In the beginning' };
      const targetOps: DeltaOperation[] = [
        { insert: '', attributes: { segment: 'verse_1_1' } },
        { insert: 'Existing verse 2', attributes: { segment: 'verse_1_2' } }
      ];
      const expectedResult: DeltaOperation[] = [
        { insert: 'In the beginning', attributes: { segment: 'verse_1_1', draft: true } },
        { insert: 'Existing verse 2', attributes: { segment: 'verse_1_2' } }
      ];
      const result: DeltaOperation[] = service.toDraftOps(draft, targetOps);
      expect(result).toEqual(expectedResult);
    });

    it('should preserve existing translation if available', () => {
      const draft: DraftSegmentMap = { verse_1_1: 'In the beginning' };
      const targetOps: DeltaOperation[] = [{ insert: 'existing translation', attributes: { segment: 'verse_1_1' } }];
      const result: DeltaOperation[] = service.toDraftOps(draft, targetOps);
      expect(result).toEqual(targetOps);
    });
  });
});
