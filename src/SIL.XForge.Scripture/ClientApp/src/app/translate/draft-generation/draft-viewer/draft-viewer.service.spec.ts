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
      expect(service.hasDraftOps(draft, targetOps)).toBeFalse();
    });

    it('should return false if all target ops have existing translation', () => {
      const draft: DraftSegmentMap = { verse_1_1: 'In the beginning' };
      const targetOps: DeltaOperation[] = [{ insert: 'existing translation', attributes: { segment: 'verse_1_1' } }];
      expect(service.hasDraftOps(draft, targetOps)).toBeFalse();
    });

    it('should return false for ops with insert object that is not { blank: true}', () => {
      const draft: DraftSegmentMap = { verse_1_1: 'In the beginning' };
      const targetOps: DeltaOperation[] = [
        { insert: { 'note-thread-embed': {} }, attributes: { segment: 'verse_1_1' } }
      ];
      expect(service.hasDraftOps(draft, targetOps)).toBeFalse();
    });

    it('should return true if there is a target op without existing translation', () => {
      const draft: DraftSegmentMap = { verse_1_1: 'In the beginning' };
      const targetOps: DeltaOperation[] = [{ insert: '', attributes: { segment: 'verse_1_1' } }];
      expect(service.hasDraftOps(draft, targetOps)).toBeTrue();
    });
  });

  describe('toDraftOps', () => {
    it('should return target ops as-is if draft is empty', () => {
      const draft: DraftSegmentMap = {};
      const targetOps: DeltaOperation[] = [{ insert: 'existing translation', attributes: { segment: 'verse_1_1' } }];
      expect(service.toDraftOps(draft, targetOps)).toEqual(targetOps);
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
      expect(service.toDraftOps(draft, targetOps)).toEqual(expectedResult);
    });

    it('should preserve existing translation if available', () => {
      const draft: DraftSegmentMap = { verse_1_1: 'In the beginning' };
      const targetOps: DeltaOperation[] = [{ insert: 'existing translation', attributes: { segment: 'verse_1_1' } }];
      expect(service.toDraftOps(draft, targetOps)).toEqual(targetOps);
    });

    it('should allow combined verses in the source that are separated in the target', () => {
      const draft: DraftSegmentMap = { 'verse_1_1-2': 'In the beginning' };
      const targetOps: DeltaOperation[] = [
        { insert: '', attributes: { segment: 'verse_1_1' } },
        { insert: 'Existing verse 2', attributes: { segment: 'verse_1_2' } }
      ];
      const expectedResult: DeltaOperation[] = [
        { insert: 'In the beginning', attributes: { segment: 'verse_1_1', draft: true } },
        { insert: 'Existing verse 2', attributes: { segment: 'verse_1_2' } }
      ];
      expect(service.toDraftOps(draft, targetOps)).toEqual(expectedResult);
    });

    it('should allow combined verses in the target that are separated in the source', () => {
      const draft: DraftSegmentMap = {
        verse_150_1: 'Praise ye the Lord. ',
        verse_150_2: 'Praise him for his mighty acts: ',
        verse_150_3: 'Praise him with the sound of the trumpet: '
      };
      const targetOps: DeltaOperation[] = [{ insert: '', attributes: { segment: 'verse_150_1-3' } }];
      const expectedResult: DeltaOperation[] = [
        {
          insert: 'Praise ye the Lord. Praise him for his mighty acts: Praise him with the sound of the trumpet: ',
          attributes: { segment: 'verse_150_1-3', draft: true }
        }
      ];
      expect(service.toDraftOps(draft, targetOps)).toEqual(expectedResult);
    });

    it('should allow combined verses in the target that are combined in the source', () => {
      const draft: DraftSegmentMap = {
        'verse_150_1-3':
          'Praise ye the Lord. Praise him for his mighty acts: Praise him with the sound of the trumpet: '
      };
      const targetOps: DeltaOperation[] = [{ insert: '', attributes: { segment: 'verse_150_1-3' } }];
      const expectedResult: DeltaOperation[] = [
        {
          insert: 'Praise ye the Lord. Praise him for his mighty acts: Praise him with the sound of the trumpet: ',
          attributes: { segment: 'verse_150_1-3', draft: true }
        }
      ];
      expect(service.toDraftOps(draft, targetOps)).toEqual(expectedResult);
    });

    it('should allow partially combined verses in the target that are combined in the source', () => {
      const draft: DraftSegmentMap = {
        'verse_150_1-3':
          'Praise ye the Lord. Praise him for his mighty acts: Praise him with the sound of the trumpet: '
      };
      const targetOps: DeltaOperation[] = [{ insert: '', attributes: { segment: 'verse_150_1-2' } }];
      const expectedResult: DeltaOperation[] = [
        {
          insert: 'Praise ye the Lord. Praise him for his mighty acts: Praise him with the sound of the trumpet: ',
          attributes: { segment: 'verse_150_1-2', draft: true }
        }
      ];
      expect(service.toDraftOps(draft, targetOps)).toEqual(expectedResult);
    });

    it('should allow partially combined verses in the target that are combined in the source with an incorrect entry', () => {
      const draft: DraftSegmentMap = {
        'verse_150_1-2': 'Praise ye the Lord. Praise him for his mighty acts: ',
        // Known issue: This verse will not be merged into 1-3 in the target
        verse_150_1_3: 'Praise him with the sound of the trumpet: '
      };
      const targetOps: DeltaOperation[] = [{ insert: '', attributes: { segment: 'verse_150_1-3' } }];
      const expectedResult: DeltaOperation[] = [
        {
          insert: 'Praise ye the Lord. Praise him for his mighty acts: ',
          attributes: { segment: 'verse_150_1-3', draft: true }
        }
      ];
      expect(service.toDraftOps(draft, targetOps)).toEqual(expectedResult);
    });

    it('should allow combined verses in the target that only one exists in the source', () => {
      const draft: DraftSegmentMap = {
        verse_150_1: 'Praise ye the Lord. ',
        verse_150_2: 'Praise him for his mighty acts: '
      };
      const targetOps: DeltaOperation[] = [{ insert: '', attributes: { segment: 'verse_150_1-3' } }];
      const expectedResult: DeltaOperation[] = [
        {
          insert: 'Praise ye the Lord. Praise him for his mighty acts: ',
          attributes: { segment: 'verse_150_1-3', draft: true }
        }
      ];
      expect(service.toDraftOps(draft, targetOps)).toEqual(expectedResult);
    });
  });
});
