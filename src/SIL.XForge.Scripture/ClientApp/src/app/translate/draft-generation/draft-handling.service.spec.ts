import { TestBed } from '@angular/core/testing';
import { Delta } from 'quill';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { DeltaOperation } from 'rich-text';
import { of } from 'rxjs';
import { anything, instance, mock, verify, when } from 'ts-mockito';
import { configureTestingModule } from 'xforge-common/test-utils';
import { TextDocId } from '../../core/models/text-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { TextDocService } from '../../core/text-doc.service';
import { DraftGenerationService } from './draft-generation.service';
import { DraftHandlingService } from './draft-handling.service';

const mockedProjectService = mock(SFProjectService);
const mockedTextDocService = mock(TextDocService);
const mockedDraftGenerationService = mock(DraftGenerationService);

describe('DraftHandlingService', () => {
  let service: DraftHandlingService;

  configureTestingModule(() => ({
    providers: [
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: TextDocService, useMock: mockedTextDocService },
      { provide: DraftGenerationService, useMock: mockedDraftGenerationService }
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
      service.getDraft(textDocId, { timestamp: undefined }).subscribe(draftData => expect(draftData).toEqual(draftOps));
      verify(
        mockedDraftGenerationService.getGeneratedDraftDeltaOperations('project01', 1, 1, undefined, undefined)
      ).once();
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
      when(mockedTextDocService.canRestore(anything(), 1, 1)).thenReturn(true);
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

    it('should apply draft to text doc with verse letter', async () => {
      const textDocId = new TextDocId('project01', 1, 1);
      const draftOps: DeltaOperation[] = [
        { insert: { verse: { number: '1a' } } },
        { insert: 'In the beginning', attributes: { segment: 'verse_1_1a' } }
      ];
      when(mockedTextDocService.canRestore(anything(), 1, 1)).thenReturn(true);
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

    it('should apply draft to text doc with verse range', async () => {
      const textDocId = new TextDocId('project01', 1, 1);
      const draftOps: DeltaOperation[] = [
        { insert: { verse: { number: '1-2' } } },
        { insert: 'In the beginning', attributes: { segment: 'verse_1_1-2' } }
      ];
      when(mockedTextDocService.canRestore(anything(), 1, 1)).thenReturn(true);
      await service.applyChapterDraftAsync(textDocId, new Delta(draftOps));
      verify(mockedTextDocService.overwrite(textDocId, anything(), 'Draft')).once();
      verify(
        mockedProjectService.onlineSetDraftApplied(
          textDocId.projectId,
          textDocId.bookNum,
          textDocId.chapterNum,
          true,
          2
        )
      ).once();
      expect().nothing();
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
