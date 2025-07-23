import { TestBed } from '@angular/core/testing';
import { Delta } from 'quill';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { DeltaOperation } from 'rich-text';
import { of, throwError } from 'rxjs';
import { anything, instance, mock, verify, when } from 'ts-mockito';
import { ErrorReportingService } from 'xforge-common/error-reporting.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { TextDocId } from '../../core/models/text-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { TextDocService } from '../../core/text-doc.service';
import { DraftSegmentMap } from './draft-generation';
import { DraftGenerationService } from './draft-generation.service';
import { DraftHandlingService } from './draft-handling.service';

const mockedProjectService = mock(SFProjectService);
const mockedTextDocService = mock(TextDocService);
const mockedDraftGenerationService = mock(DraftGenerationService);
const mockedSFProject = mock(SFProjectProfileDoc);
const mockedErrorReportingService = mock(ErrorReportingService);

describe('DraftHandlingService', () => {
  let service: DraftHandlingService;

  configureTestingModule(() => ({
    providers: [
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: TextDocService, useMock: mockedTextDocService },
      { provide: DraftGenerationService, useMock: mockedDraftGenerationService },
      { provide: ErrorReportingService, useMock: mockedErrorReportingService }
    ]
  }));

  beforeEach(() => {
    service = TestBed.inject(DraftHandlingService);
  });

  describe('getDraft', () => {
    it('should get a draft', () => {
      const textDocId = new TextDocId('project01', 1, 1);
      const draftOps: DeltaOperation[] = [{ insert: 'In the beginning', attributes: { segment: 'verse_1_1' } }];
      when(
        mockedDraftGenerationService.getGeneratedDraftDeltaOperations(
          anything(),
          anything(),
          anything(),
          anything(),
          anything()
        )
      ).thenReturn(of(draftOps));
      service
        .getDraft(textDocId, { isDraftLegacy: false, timestamp: undefined })
        .subscribe(draftData => expect(draftData).toEqual(draftOps));
      verify(
        mockedDraftGenerationService.getGeneratedDraftDeltaOperations('project01', 1, 1, undefined, undefined)
      ).once();
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
        mockedDraftGenerationService.getGeneratedDraftDeltaOperations(
          anything(),
          anything(),
          anything(),
          anything(),
          anything()
        )
      ).thenReturn(throwError(() => ({ status: 405 })));
      when(mockedDraftGenerationService.getGeneratedDraft(anything(), anything(), anything())).thenReturn(of(draft));
      service
        .getDraft(textDocId, { isDraftLegacy: false, timestamp: undefined })
        .subscribe(draftData => expect(draftData).toEqual(draft));
      verify(
        mockedDraftGenerationService.getGeneratedDraftDeltaOperations('project01', 1, 1, undefined, undefined)
      ).once();
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

  describe('draftDataToOps', () => {
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

  describe('canApplyDraft', () => {
    it('should allow applying if all criteria are met', async () => {
      const projectProfile = instance(mock<SFProjectProfile>());
      const book = 1;
      const chapter = 1;
      const draftOps: DeltaOperation[] = [
        { insert: 'In the beginning', attributes: { segment: 'verse_1_1', draft: true } },
        { insert: 'God created the heavens and the earth', attributes: { segment: 'verse_1_2', draft: true } }
      ];

      when(mockedTextDocService.hasChapterEditPermission(projectProfile, book, chapter)).thenReturn(true);
      when(mockedTextDocService.userHasGeneralEditRight(projectProfile)).thenReturn(true);
      when(mockedTextDocService.isDataInSync(projectProfile)).thenReturn(true);
      when(mockedTextDocService.isEditingDisabled(projectProfile)).thenReturn(false);

      expect(service.canApplyDraft(projectProfile, book, chapter, draftOps)).toBe(true);
    });

    it('should not allow applying if lacking chapter edit permission', async () => {
      const projectProfile = instance(mock<SFProjectProfile>());
      const book = 1;
      const chapter = 1;
      const draftOps: DeltaOperation[] = [
        { insert: 'In the beginning', attributes: { segment: 'verse_1_1', draft: true } },
        { insert: 'God created the heavens and the earth', attributes: { segment: 'verse_1_2', draft: true } }
      ];

      when(mockedTextDocService.hasChapterEditPermission(projectProfile, book, chapter)).thenReturn(false);
      when(mockedTextDocService.userHasGeneralEditRight(projectProfile)).thenReturn(true);
      when(mockedTextDocService.isDataInSync(projectProfile)).thenReturn(true);
      when(mockedTextDocService.isEditingDisabled(projectProfile)).thenReturn(false);

      expect(service.canApplyDraft(projectProfile, book, chapter, draftOps)).toBe(false);
    });

    it('should not allow applying if lacking general edit permission', async () => {
      const projectProfile = instance(mock<SFProjectProfile>());
      const book = 1;
      const chapter = 1;
      const draftOps: DeltaOperation[] = [
        { insert: 'In the beginning', attributes: { segment: 'verse_1_1', draft: true } },
        { insert: 'God created the heavens and the earth', attributes: { segment: 'verse_1_2', draft: true } }
      ];

      when(mockedTextDocService.hasChapterEditPermission(projectProfile, book, chapter)).thenReturn(true);
      when(mockedTextDocService.userHasGeneralEditRight(projectProfile)).thenReturn(false);
      when(mockedTextDocService.isDataInSync(projectProfile)).thenReturn(true);
      when(mockedTextDocService.isEditingDisabled(projectProfile)).thenReturn(false);

      expect(service.canApplyDraft(projectProfile, book, chapter, draftOps)).toBe(false);
    });

    it('should not allow applying if data is not in sync', async () => {
      const projectProfile = instance(mock<SFProjectProfile>());
      const book = 1;
      const chapter = 1;
      const draftOps: DeltaOperation[] = [
        { insert: 'In the beginning', attributes: { segment: 'verse_1_1', draft: true } },
        { insert: 'God created the heavens and the earth', attributes: { segment: 'verse_1_2', draft: true } }
      ];

      when(mockedTextDocService.hasChapterEditPermission(projectProfile, book, chapter)).thenReturn(true);
      when(mockedTextDocService.userHasGeneralEditRight(projectProfile)).thenReturn(true);
      when(mockedTextDocService.isDataInSync(projectProfile)).thenReturn(false);
      when(mockedTextDocService.isEditingDisabled(projectProfile)).thenReturn(false);

      expect(service.canApplyDraft(projectProfile, book, chapter, draftOps)).toBe(false);
    });

    it('should not allow applying if editing is disabled', async () => {
      const projectProfile = instance(mock<SFProjectProfile>());
      const book = 1;
      const chapter = 1;
      const draftOps: DeltaOperation[] = [
        { insert: 'In the beginning', attributes: { segment: 'verse_1_1', draft: true } },
        { insert: 'God created the heavens and the earth', attributes: { segment: 'verse_1_2', draft: true } }
      ];

      when(mockedTextDocService.hasChapterEditPermission(projectProfile, book, chapter)).thenReturn(true);
      when(mockedTextDocService.userHasGeneralEditRight(projectProfile)).thenReturn(true);
      when(mockedTextDocService.isDataInSync(projectProfile)).thenReturn(true);
      when(mockedTextDocService.isEditingDisabled(projectProfile)).thenReturn(true);

      expect(service.canApplyDraft(projectProfile, book, chapter, draftOps)).toBe(false);
    });

    it('should not allow applying if draft is corrupted', async () => {
      const projectProfile = instance(mock<SFProjectProfile>());
      const book = 1;
      const chapter = 1;
      const badOps: DeltaOperation[] = [
        { attributes: { segment: 'verse_1_1', draft: true } },
        { insert: 'God created the heavens and the earth', attributes: { segment: 'verse_1_2', draft: true } }
      ];

      when(mockedTextDocService.hasChapterEditPermission(projectProfile, book, chapter)).thenReturn(true);
      when(mockedTextDocService.userHasGeneralEditRight(projectProfile)).thenReturn(true);
      when(mockedTextDocService.isDataInSync(projectProfile)).thenReturn(true);
      when(mockedTextDocService.isEditingDisabled(projectProfile)).thenReturn(false);

      expect(service.canApplyDraft(projectProfile, book, chapter, badOps)).toBe(false);
    });
  });

  describe('applyChapterDraftAsync', () => {
    it('should apply draft to text doc', async () => {
      const textDocId = new TextDocId('project01', 1, 1);
      const draftOps: DeltaOperation[] = [
        { insert: { verse: { number: 1 } } },
        { insert: 'In the beginning', attributes: { segment: 'verse_1_1' } }
      ];
      when(mockedTextDocService.canEdit(anything(), 1, 1)).thenReturn(true);
      await service.applyChapterDraftAsync(textDocId, new Delta(draftOps));
      verify(mockedTextDocService.overwrite(textDocId, anything(), 'Draft')).once();
      verify(
        mockedProjectService.onlineSetDraftApplied(
          textDocId.projectId,
          textDocId.bookNum,
          textDocId.chapterNum,
          true,
          1
        )
      ).once();
      expect().nothing();
    });
  });

  describe('getAndApplyDraftAsync', () => {
    it('should get and apply draft', async () => {
      const textDocId = new TextDocId('project01', 1, 1);
      const draft: DeltaOperation[] = [
        { insert: { verse: { number: 1 } } },
        { insert: 'In the beginning', attributes: { segment: 'verse_1_1' } }
      ];
      when(
        mockedDraftGenerationService.getGeneratedDraftDeltaOperations(
          anything(),
          anything(),
          anything(),
          anything(),
          anything()
        )
      ).thenReturn(of(draft));
      when(mockedTextDocService.canEdit(anything(), 1, 1)).thenReturn(true);
      const result: boolean = await service.getAndApplyDraftAsync(
        mockedSFProject.data!,
        textDocId,
        textDocId,
        undefined
      );
      expect(result).toBe(true);
      verify(
        mockedDraftGenerationService.getGeneratedDraftDeltaOperations('project01', 1, 1, undefined, undefined)
      ).once();
      verify(mockedTextDocService.overwrite(textDocId, anything(), 'Draft')).once();
      verify(
        mockedProjectService.onlineSetDraftApplied(
          textDocId.projectId,
          textDocId.bookNum,
          textDocId.chapterNum,
          true,
          1
        )
      ).once();
      verify(
        mockedProjectService.onlineSetIsValid(textDocId.projectId, textDocId.bookNum, textDocId.chapterNum, true)
      ).once();
    });

    it('should not apply if user does not have permission', async () => {
      const textDocId = new TextDocId('project01', 1, 1);
      const draft: DeltaOperation[] = [{ insert: 'In the beginning', attributes: { segment: 'verse_1_1' } }];
      when(
        mockedDraftGenerationService.getGeneratedDraftDeltaOperations(anything(), anything(), anything(), anything())
      ).thenReturn(of(draft));
      when(mockedTextDocService.canEdit(anything(), 1, 1)).thenReturn(false);
      const result: boolean = await service.getAndApplyDraftAsync(
        mockedSFProject.data!,
        textDocId,
        textDocId,
        undefined
      );
      expect(result).toBe(false);
      verify(mockedDraftGenerationService.getGeneratedDraftDeltaOperations('project01', 1, 1, undefined)).never();
      verify(mockedTextDocService.overwrite(textDocId, anything(), 'Draft')).never();
    });

    it('should not apply legacy USFM draft', async () => {
      const textDocId = new TextDocId('project01', 1, 1);
      const draft: DraftSegmentMap = { verse_1_1: 'In the beginning' };
      when(
        mockedDraftGenerationService.getGeneratedDraftDeltaOperations(
          anything(),
          anything(),
          anything(),
          anything(),
          anything()
        )
      ).thenReturn(throwError(() => ({ status: 405 })));
      when(mockedDraftGenerationService.getGeneratedDraft(anything(), anything(), anything())).thenReturn(of(draft));
      when(mockedTextDocService.canEdit(anything(), 1, 1)).thenReturn(true);
      const result: boolean = await service.getAndApplyDraftAsync(
        mockedSFProject.data!,
        textDocId,
        textDocId,
        undefined
      );
      expect(result).toBe(false);
      verify(
        mockedDraftGenerationService.getGeneratedDraftDeltaOperations('project01', 1, 1, undefined, undefined)
      ).once();
      verify(mockedDraftGenerationService.getGeneratedDraft('project01', 1, 1)).once();
      verify(mockedTextDocService.overwrite(textDocId, anything(), 'Draft')).never();
    });

    it('should return false if applying a draft fails', async () => {
      const textDocId = new TextDocId('project01', 1, 1);
      const draft: DeltaOperation[] = [
        { insert: { verse: { number: 1 } } },
        { insert: 'In the beginning', attributes: { segment: 'verse_1_1' } }
      ];
      when(
        mockedDraftGenerationService.getGeneratedDraftDeltaOperations(
          anything(),
          anything(),
          anything(),
          anything(),
          anything()
        )
      ).thenReturn(of(draft));
      when(mockedTextDocService.canEdit(anything(), 1, 1)).thenReturn(true);
      when(
        mockedProjectService.onlineSetDraftApplied(anything(), anything(), anything(), anything(), anything())
      ).thenReturn(Promise.reject(new Error('Failed')));
      const result: boolean = await service.getAndApplyDraftAsync(
        mockedSFProject.data!,
        textDocId,
        textDocId,
        undefined
      );
      expect(result).toBe(false);
      verify(
        mockedDraftGenerationService.getGeneratedDraftDeltaOperations('project01', 1, 1, undefined, undefined)
      ).once();
      verify(mockedErrorReportingService.silentError(anything(), anything())).once();
      verify(mockedTextDocService.overwrite(textDocId, anything(), anything())).never();
      verify(
        mockedProjectService.onlineSetDraftApplied(
          textDocId.projectId,
          textDocId.bookNum,
          textDocId.chapterNum,
          true,
          1
        )
      ).once();
    });

    it('should return false if applying a draft fails at getting the draft', async () => {
      const textDocId = new TextDocId('project01', 1, 1);
      when(mockedTextDocService.canEdit(anything(), 1, 1)).thenReturn(true);
      when(
        mockedDraftGenerationService.getGeneratedDraftDeltaOperations(
          anything(),
          anything(),
          anything(),
          anything(),
          anything()
        )
      ).thenReturn(throwError(() => ({ message: 'Getting draft failed', status: 404 })));
      const result: boolean = await service.getAndApplyDraftAsync(
        mockedSFProject.data!,
        textDocId,
        textDocId,
        undefined
      );
      expect(result).toBe(false);
      verify(
        mockedDraftGenerationService.getGeneratedDraftDeltaOperations('project01', 1, 1, undefined, undefined)
      ).once();
      verify(mockedErrorReportingService.silentError(anything(), anything())).once();
      verify(
        mockedProjectService.onlineSetDraftApplied(
          textDocId.projectId,
          textDocId.bookNum,
          textDocId.chapterNum,
          true,
          anything()
        )
      ).never();
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
