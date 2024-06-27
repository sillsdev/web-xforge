import { TestBed } from '@angular/core/testing';
import { DeltaOperation } from 'rich-text';
import { of, throwError } from 'rxjs';
import { anything, mock, verify, when } from 'ts-mockito';
import { configureTestingModule } from 'xforge-common/test-utils';
import { TextDocId } from '../../../core/models/text-doc';
import { SFProjectService } from '../../../core/sf-project.service';
import { TextDocService } from '../../../core/text-doc.service';
import { DraftSegmentMap } from '../draft-generation';
import { DraftGenerationService } from '../draft-generation.service';
import { DraftViewerService } from './draft-viewer.service';

const mockedTextDocService = mock(TextDocService);
const mockedProjectService = mock(SFProjectService);
const mockedDraftGenerationService = mock(DraftGenerationService);

describe('DraftViewerService', () => {
  let service: DraftViewerService;

  configureTestingModule(() => ({
    providers: [
      { provide: TextDocService, useMock: mockedTextDocService },
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: DraftGenerationService, useMock: mockedDraftGenerationService }
    ]
  }));

  beforeEach(() => {
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

  describe('getDraft', () => {
    it('should get a draft', () => {
      const textDocId = new TextDocId('project01', 1, 1);
      const draftOps: DeltaOperation[] = [{ insert: 'In the beginning', attributes: { segment: 'verse_1_1' } }];
      when(
        mockedDraftGenerationService.getGeneratedDraftDeltaOperations(anything(), anything(), anything())
      ).thenReturn(of(draftOps));
      service.getDraft(textDocId, { isDraftLegacy: false }).subscribe(draftData => expect(draftData).toEqual(draftOps));
      verify(mockedDraftGenerationService.getGeneratedDraftDeltaOperations('project01', 1, 1)).once();
      verify(mockedDraftGenerationService.getGeneratedDraft('project01', 1, 1)).never();
    });

    it('should get a draft with the legacy USFM segment map if getting ops fails', () => {
      const textDocId = new TextDocId('project01', 1, 1);
      const draft: DraftSegmentMap = {
        verse_150_1: 'Praise ye the Lord. ',
        verse_150_2: 'Praise him for his mighty acts: ',
        verse_150_3: 'Praise him with the sound of the trumpet: '
      };
      when(
        mockedDraftGenerationService.getGeneratedDraftDeltaOperations(anything(), anything(), anything())
      ).thenReturn(throwError(() => ({ status: 405 })));
      when(mockedDraftGenerationService.getGeneratedDraft(anything(), anything(), anything())).thenReturn(of(draft));
      service.getDraft(textDocId, { isDraftLegacy: false }).subscribe(draftData => expect(draftData).toEqual(draft));
      verify(mockedDraftGenerationService.getGeneratedDraftDeltaOperations('project01', 1, 1)).once();
      verify(mockedDraftGenerationService.getGeneratedDraft('project01', 1, 1)).once();
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

  describe('getDraft', () => {
    it('should return empty ops if draft is legacy and target ops is empty', () => {
      const draft: DraftSegmentMap = {
        verse_1_1: 'In the beginning',
        verse_1_2: 'God created the heavens and the earth'
      };
      const targetOps: DeltaOperation[] = [];
      const expected: DeltaOperation[] = [];
      const result: DeltaOperation[] = service.draftDataToOps(draft, targetOps);
      expect(result).toEqual(expected);
    });

    it('should convert legacy draft to draft ops', () => {
      const draft: DraftSegmentMap = {
        verse_1_1: 'In the beginning',
        verse_1_2: 'God created the heavens and the earth'
      };
      const targetOps: DeltaOperation[] = [
        { insert: '', attributes: { segment: 'verse_1_1' } },
        { insert: '', attributes: { segment: 'verse_1_2' } }
      ];
      const expected: DeltaOperation[] = [
        { insert: 'In the beginning', attributes: { segment: 'verse_1_1', draft: true } },
        { insert: 'God created the heavens and the earth', attributes: { segment: 'verse_1_2', draft: true } }
      ];
      const result: DeltaOperation[] = service.draftDataToOps(draft, targetOps);
      expect(result).toEqual(expected);
    });

    it('should not change draft ops if draft data was already in op form', () => {
      const draftOps: DeltaOperation[] = [
        { insert: 'In the beginning', attributes: { segment: 'verse_1_1', draft: true } },
        { insert: 'God created the heavens and the earth', attributes: { segment: 'verse_1_2', draft: true } }
      ];
      const targetOps: DeltaOperation[] = [
        { insert: '', attributes: { segment: 'verse_1_1' } },
        { insert: '', attributes: { segment: 'verse_1_2' } }
      ];
      const result: DeltaOperation[] = service.draftDataToOps(draftOps, targetOps);
      expect(result).toEqual(draftOps);
    });
  });

  describe('opsHaveContent', () => {
    it('should return false if all ops are blank', () => {
      const ops: DeltaOperation[] = [{ insert: {} }, { insert: {} }];
      expect(service.opsHaveContent(ops)).toBeFalse();
    });

    it('should return true if any op has content', () => {
      const ops: DeltaOperation[] = [{ insert: 'content' }];
      expect(service.opsHaveContent(ops)).toBeTrue();
    });

    it('should return false if the only op with content is a trailing newline', () => {
      const newLineNotFinalOp: DeltaOperation[] = [{ insert: '\n' }, { insert: {} }];
      expect(service.opsHaveContent(newLineNotFinalOp)).toBeTrue();

      const newLineFinalOp: DeltaOperation[] = [{ insert: {} }, { insert: '\n' }];
      expect(service.opsHaveContent(newLineFinalOp)).toBeFalse();
    });
  });
});
