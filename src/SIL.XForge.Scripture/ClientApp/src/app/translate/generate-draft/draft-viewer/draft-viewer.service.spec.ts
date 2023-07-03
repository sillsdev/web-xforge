import { TestBed } from '@angular/core/testing';
import { DeltaOperation } from 'rich-text';
import { DraftViewerService } from './draft-viewer.service';

describe('DraftViewerService', () => {
  let service: DraftViewerService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DraftViewerService);
  });

  describe('hasDraftOps', () => {
    it('should return false if draft is empty', () => {
      const draft = {};
      const targetOps: DeltaOperation[] = [];
      const result = service.hasDraftOps(draft, targetOps);
      expect(result).toBeFalse();
    });

    it('should return false if all target ops have existing translation', () => {
      const draft = { segment1: 'pretranslation1' };
      const targetOps = [{ insert: 'existing translation', attributes: { segment: 'segment1' } }];
      const result = service.hasDraftOps(draft, targetOps);
      expect(result).toBeFalse();
    });

    it('should return true if there is a target op without existing translation', () => {
      const draft = { segment1: 'pretranslation1' };
      const targetOps = [{ insert: '', attributes: { segment: 'segment1' } }];
      const result = service.hasDraftOps(draft, targetOps);
      expect(result).toBeTrue();
    });
  });

  describe('toDraftOps', () => {
    it('should return target ops as is if draft is empty', () => {
      const draft = {};
      const targetOps = [{ insert: 'existing translation', attributes: { segment: 'segment1' } }];
      const result = service.toDraftOps(draft, targetOps);
      expect(result).toEqual(targetOps);
    });

    it('should return target ops with draft pretranslation copied', () => {
      const draft = { segment1: 'pretranslation1' };
      const targetOps = [{ insert: '', attributes: { segment: 'segment1' } }];
      const expectedResult = [{ insert: 'pretranslation1', attributes: { segment: 'segment1', draft: true } }];
      const result = service.toDraftOps(draft, targetOps);
      expect(result).toEqual(expectedResult);
    });

    it('should preserve existing translation if available', () => {
      const draft = { segment1: 'pretranslation1' };
      const targetOps = [{ insert: 'existing translation', attributes: { segment: 'segment1' } }];
      const result = service.toDraftOps(draft, targetOps);
      expect(result).toEqual(targetOps);
    });
  });
});
