import { DestroyRef, ErrorHandler } from '@angular/core';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Canon } from '@sillsdev/scripture';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { TrainingData } from 'realtime-server/lib/esm/scriptureforge/models/training-data';
import { BehaviorSubject, filter, firstValueFrom, Observable, of } from 'rxjs';
import { anything, capture, deepEqual, instance, mock, reset, resetCalls, verify, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { ErrorReportingService } from 'xforge-common/error-reporting.service';
import { createTestFeatureFlag, FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { I18nService } from 'xforge-common/i18n.service';
import { provideTestOnlineStatus } from 'xforge-common/test-online-status-providers';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { UserService } from 'xforge-common/user.service';
import { ParatextProject } from '../../../core/models/paratext-project';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { ParatextService } from '../../../core/paratext.service';
import { NllbLanguageService } from '../../nllb-language.service';
import { DraftGenerationService } from '../draft-generation.service';
import { DraftSource } from '../draft-source';
import { DraftSourcesService } from '../draft-sources.service';
import { TrainingDataService } from '../training-data/training-data.service';
import {
  ALLOW_DRAFTING_BOOKS_NOT_IN_TARGET,
  DraftProgressService,
  NewDraftLogicHandler
} from './new-draft-logic-handler';
import { NewDraftComponent } from './new-draft.component';
import { VerboseScriptureRange } from './scripture-range';

const SOURCE_SHORT_NAME = 'DS1';
const TARGET_SHORT_NAME = 'TP1';

describe('NewDraftComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [TestOnlineStatusService, provideTestOnlineStatus()] });
    // These tests aren't exercising the target-membership gate, and the test project has no text list, so allow
    // drafting books regardless of target membership. Reset afterwards so it doesn't leak into other specs.
    NewDraftLogicHandler.allowDraftingBooksNotInTarget = true;
  });

  afterEach(() => {
    NewDraftLogicHandler.allowDraftingBooksNotInTarget = ALLOW_DRAFTING_BOOKS_NOT_IN_TARGET;
  });

  // GEN: source has 50 chapters, target has GEN1-5 -> eligible for partial drafting
  const testState = {
    draftingSourceBooksChapters: 'GEN1-50;MAT1-28;MRK1-16;LUK1-24;JHN1-21',
    targetProjectBooksChapters: 'GEN1-5;MAT1-28;MRK1-16;LUK1-24;JHN1-21',
    trainingSourcesBooksChapters: { 'training-source-1-id': 'GEN1-50;MAT1-28;MRK1-16;LUK1-24;JHN1-21' }
  };

  describe('onDraftingChaptersBlurred', () => {
    it('sets an invalid_range error for unparseable input', async () => {
      const env = new TestEnvironment(testState);
      await env.waitForInit();
      env.component.logicHandler.selectDraftingBooks(['GEN']);

      env.component.onDraftingChaptersBlurred('GEN', 'abc');

      expect(env.component.draftingChapterErrors.get('GEN')?.key).toBe('chapter_input.invalid_range');
    });

    it('rejects empty or whitespace-only input without changing the drafting selection', async () => {
      const env = new TestEnvironment(testState);
      await env.waitForInit();
      env.component.logicHandler.selectDraftingBooks(['GEN']);
      const defaultRange = env.selectedDraftingScriptureRange;

      env.component.onDraftingChaptersBlurred('GEN', '');
      expect(env.component.draftingChapterErrors.get('GEN')?.key).toBe('chapter_input.empty_draft');

      env.component.onDraftingChaptersBlurred('GEN', '   ');
      expect(env.component.draftingChapterErrors.get('GEN')?.key).toBe('chapter_input.empty_draft');

      // The book keeps its prior (non-empty) range rather than being stored with zero chapters.
      expect(env.selectedDraftingScriptureRange).toBe(defaultRange);
      expect(env.selectedDraftingScriptureRange).not.toBe('GEN');
    });

    it('sets a chapters_not_in_source error with source name for out-of-range chapters', async () => {
      const env = new TestEnvironment(testState);
      await env.waitForInit();
      env.component.logicHandler.selectDraftingBooks(['GEN']);

      // GEN has only 50 chapters in the source
      env.component.onDraftingChaptersBlurred('GEN', '51-60');

      const error = env.component.draftingChapterErrors.get('GEN');
      expect(error?.key).toBe('chapter_input.chapters_not_in_source');
      expect(error?.params).toEqual(jasmine.objectContaining({ chapters: '51-60', sourceName: SOURCE_SHORT_NAME }));
    });

    it('clears the error and updates state for valid input', async () => {
      const env = new TestEnvironment(testState);
      await env.waitForInit();
      env.component.logicHandler.selectDraftingBooks(['GEN']);

      // First introduce an error
      env.component.onDraftingChaptersBlurred('GEN', 'abc');
      expect(env.component.draftingChapterErrors.has('GEN')).toBeTrue();

      // Then provide valid input
      env.component.onDraftingChaptersBlurred('GEN', '6-30');

      expect(env.component.draftingChapterErrors.has('GEN')).toBeFalse();
      expect(env.selectedDraftingScriptureRange).toBe('GEN6-30');
    });
  });

  describe('onTargetTrainingChaptersBlurred', () => {
    it('sets an invalid_range error for unparseable input', async () => {
      const env = new TestEnvironment(testState);
      await env.waitForInit();
      await env.selectGENForTraining();

      env.component.onTargetTrainingChaptersBlurred('GEN', 'xyz');

      expect(env.component.targetTrainingChapterErrors.get('GEN')?.key).toBe('chapter_input.invalid_range');
    });

    it('rejects empty or whitespace-only input without changing the target training selection', async () => {
      const env = new TestEnvironment(testState);
      await env.waitForInit();
      await env.selectGENForTraining();
      const defaultRange = env.selectedTargetTrainingScriptureRange;

      env.component.onTargetTrainingChaptersBlurred('GEN', '');
      expect(env.component.targetTrainingChapterErrors.get('GEN')?.key).toBe('chapter_input.empty_training');

      env.component.onTargetTrainingChaptersBlurred('GEN', '   ');
      expect(env.component.targetTrainingChapterErrors.get('GEN')?.key).toBe('chapter_input.empty_training');

      expect(env.selectedTargetTrainingScriptureRange).toBe(defaultRange);
      expect(env.selectedTargetTrainingScriptureRange).not.toBe('GEN');
    });

    it('sets a chapters_will_be_translated error when selected chapters are being drafted', async () => {
      const env = new TestEnvironment(testState);
      await env.waitForInit();
      // GEN6-50 is being drafted; GEN1-5 is available for training
      await env.selectGENForTraining();

      // Trying to include GEN6 (which is being drafted) in training
      env.component.onTargetTrainingChaptersBlurred('GEN', '1-10');

      const error = env.component.targetTrainingChapterErrors.get('GEN');
      expect(error?.key).toBe('chapter_input.chapters_will_be_translated');
      expect(error?.params).toEqual(jasmine.objectContaining({ chapters: '6-10' }));
    });

    it('sets a chapters_not_in_target error when selected chapters are absent from the target project', async () => {
      const env = new TestEnvironment(testState);
      await env.waitForInit();
      // Narrow the drafted range to GEN6-10, leaving GEN11-50 neither drafted nor in target
      env.component.logicHandler.selectDraftingBooks(['GEN']);
      env.component.logicHandler.selectDraftingChapters('GEN', '6-10');
      env.component.logicHandler.setInputMode('training_books');
      env.component.logicHandler.selectTargetTrainingBooks(['GEN']); // GEN1-5 available

      // GEN11-15 are not in the target project and not being drafted
      env.component.onTargetTrainingChaptersBlurred('GEN', '11-15');

      const error = env.component.targetTrainingChapterErrors.get('GEN');
      expect(error?.key).toBe('chapter_input.chapters_not_in_target');
      expect(error?.params).toEqual(jasmine.objectContaining({ chapters: '11-15', targetName: TARGET_SHORT_NAME }));
    });

    it('clears the error and updates state for valid input', async () => {
      const env = new TestEnvironment(testState);
      await env.waitForInit();
      await env.selectGENForTraining();

      // First introduce an error
      env.component.onTargetTrainingChaptersBlurred('GEN', 'xyz');
      expect(env.component.targetTrainingChapterErrors.has('GEN')).toBeTrue();

      // Then provide valid input - GEN1-3 is within the available training range GEN1-5
      env.component.onTargetTrainingChaptersBlurred('GEN', '1-3');

      expect(env.component.targetTrainingChapterErrors.has('GEN')).toBeFalse();
      expect(env.selectedTargetTrainingScriptureRange).toBe('GEN1-3');
    });
  });

  describe('training source book sync', () => {
    it('shows no source books when no target training books are selected', async () => {
      const env = new TestEnvironment(testState);
      await env.waitForInit();
      env.component.logicHandler.setInputMode('training_books');

      expect(env.component.availableTrainingSourceBooksForProject('training-source-1-id')).toEqual([]);
    });

    it('limits available source books to those selected in the target', async () => {
      const env = new TestEnvironment(testState);
      await env.waitForInit();
      env.component.logicHandler.setInputMode('training_books');

      env.component.onTargetTrainingBookSelect([Canon.bookIdToNumber('MAT'), Canon.bookIdToNumber('MRK')]);

      expect(env.availableTrainingSourceBookIds('training-source-1-id')).toEqual(['MAT', 'MRK']);
    });

    it('auto-selects source books when they are selected in the target', async () => {
      const env = new TestEnvironment(testState);
      await env.waitForInit();
      env.component.logicHandler.setInputMode('training_books');

      env.component.onTargetTrainingBookSelect([Canon.bookIdToNumber('MAT'), Canon.bookIdToNumber('MRK')]);

      const available = env.component.availableTrainingSourceBooksForProject('training-source-1-id');
      expect(available.every(b => b.selected)).toBeTrue();
    });

    it('does not offer a target book that is not in any training source', async () => {
      const stateWithoutGEN = {
        ...testState,
        trainingSourcesBooksChapters: { 'training-source-1-id': 'MAT1-28;MRK1-16;LUK1-24;JHN1-21' }
      };
      const env = new TestEnvironment(stateWithoutGEN);
      await env.waitForInit();
      env.component.logicHandler.setInputMode('training_books');

      // GEN is in the target project but not in the training source, so it isn't offered as a target training book.
      // Instead it's recorded so the UI can explain why it's missing.
      expect(env.component.availableTargetTrainingBooks.map(book => book.number)).not.toContain(
        Canon.bookIdToNumber('GEN')
      );
      expect(env.component.logicHandler.targetTrainingBooksWithoutSource$.getValue()).toContain('GEN');
    });

    it('removes a book from source when it is deselected in the target', async () => {
      const env = new TestEnvironment(testState);
      await env.waitForInit();
      env.component.logicHandler.setInputMode('training_books');
      env.component.onTargetTrainingBookSelect([Canon.bookIdToNumber('MAT'), Canon.bookIdToNumber('MRK')]);

      env.component.onTargetTrainingBookSelect([Canon.bookIdToNumber('MAT')]);

      expect(env.availableTrainingSourceBookIds('training-source-1-id')).not.toContain('MRK');
      expect(env.selectedTrainingSourceBookIds('training-source-1-id')).not.toContain('MRK');
    });

    it('preserves a manual source deselection when other target books change', async () => {
      const env = new TestEnvironment(testState);
      await env.waitForInit();
      env.component.logicHandler.setInputMode('training_books');
      // Select MAT and MRK - both auto-selected in source
      env.component.onTargetTrainingBookSelect([Canon.bookIdToNumber('MAT'), Canon.bookIdToNumber('MRK')]);
      // User manually deselects MRK from the source
      env.component.onTrainingSourceBookSelect([Canon.bookIdToNumber('MAT')], 'training-source-1-id');

      // Add LUK to target - LUK should be auto-selected, MRK should stay deselected
      env.component.onTargetTrainingBookSelect([
        Canon.bookIdToNumber('MAT'),
        Canon.bookIdToNumber('MRK'),
        Canon.bookIdToNumber('LUK')
      ]);

      expect(env.selectedTrainingSourceBookIds('training-source-1-id')).not.toContain('MRK');
      expect(env.selectedTrainingSourceBookIds('training-source-1-id')).toContain('MAT');
      expect(env.selectedTrainingSourceBookIds('training-source-1-id')).toContain('LUK');
    });
  });

  describe('training-pair forward gate', () => {
    // Select MAT and MRK as target training books (auto-selected in the source), then manually deselect MRK from the
    // source. MRK is now a selected training book with no matching reference selected. Position the wizard on the
    // training step so next() exercises the forward gate.
    async function setUpOrphanedTrainingBook(env: TestEnvironment): Promise<void> {
      await env.waitForInit();
      env.component.logicHandler.setInputMode('training_books');
      env.component.onTargetTrainingBookSelect([Canon.bookIdToNumber('MAT'), Canon.bookIdToNumber('MRK')]);
      env.component.onTrainingSourceBookSelect([Canon.bookIdToNumber('MAT')], 'training-source-1-id');
      env.component.page = 'training_books';
    }

    it('blocks advancing when a selected training book has no matching reference book selected', async () => {
      const env = new TestEnvironment(testState);
      await setUpOrphanedTrainingBook(env);

      env.component.next();

      expect(env.component.stepError).toBe('no_training_pair_selected');
      expect(env.component.page).toBe('training_books');
    });

    it('clears the error and advances once a matching reference book is selected', async () => {
      const env = new TestEnvironment(testState);
      await setUpOrphanedTrainingBook(env);
      env.component.next();
      expect(env.component.stepError).toBe('no_training_pair_selected');

      // Re-select MRK in the source, pairing it again.
      env.component.onTrainingSourceBookSelect(
        [Canon.bookIdToNumber('MAT'), Canon.bookIdToNumber('MRK')],
        'training-source-1-id'
      );
      env.component.next();

      expect(env.component.stepError).toBeNull();
      expect(env.component.page).toBe('suffix');
    });

    it('blocks an unpaired training book even when training is optional', async () => {
      const env = new TestEnvironment(testState, { trainingOptional: true });
      await setUpOrphanedTrainingBook(env);

      env.component.next();

      expect(env.component.stepError).toBe('no_training_pair_selected');
      expect(env.component.page).toBe('training_books');
    });
  });

  describe('onDraftingBookSelect', () => {
    it('removes stale errors for books no longer offered for partial drafting', async () => {
      const env = new TestEnvironment(testState);
      await env.waitForInit();
      env.component.logicHandler.selectDraftingBooks(['GEN']);
      env.component.onDraftingChaptersBlurred('GEN', 'abc');
      expect(env.component.draftingChapterErrors.has('GEN')).toBeTrue();

      // Deselect GEN - switch to MAT only, removing GEN from booksOfferedForPartialDrafting
      env.component.onDraftingBookSelect([Canon.bookIdToNumber('MAT')]);

      expect(env.component.draftingChapterErrors.has('GEN')).toBeFalse();
    });

    it('keeps errors for books still offered for partial drafting', async () => {
      const env = new TestEnvironment(testState);
      await env.waitForInit();
      env.component.logicHandler.selectDraftingBooks(['GEN']);
      env.component.onDraftingChaptersBlurred('GEN', 'abc');

      // Re-select GEN along with another book - GEN remains offered for partial drafting
      env.component.onDraftingBookSelect([Canon.bookIdToNumber('GEN'), Canon.bookIdToNumber('MAT')]);

      expect(env.component.draftingChapterErrors.has('GEN')).toBeTrue();
    });
  });

  describe('copyrightMessages', () => {
    it('returns empty when no sources have copyright banners', async () => {
      const env = new TestEnvironment(testState);
      await env.waitForInit();

      expect(env.component.copyrightMessages).toEqual([]);
    });

    it('returns messages from both drafting and training sources', async () => {
      const env = new TestEnvironment({
        ...testState,
        draftingSourceCopyrightBanner: 'Drafting source copyright',
        trainingSourceCopyrightBanners: { 'training-source-1-id': 'Training source copyright' }
      });
      await env.waitForInit();

      const banners = env.component.copyrightMessages.map(m => m.banner);
      expect(banners).toContain('Drafting source copyright');
      expect(banners).toContain('Training source copyright');
    });

    it('deduplicates sources that share the same banner text', async () => {
      const sharedBanner = 'Shared copyright notice';
      const env = new TestEnvironment({
        ...testState,
        draftingSourceCopyrightBanner: sharedBanner,
        trainingSourceCopyrightBanners: { 'training-source-1-id': sharedBanner }
      });
      await env.waitForInit();

      expect(env.component.copyrightMessages.length).toBe(1);
      expect(env.component.copyrightMessages[0].banner).toBe(sharedBanner);
    });
  });

  describe('generateDraftClicked', () => {
    beforeEach(() => {
      reset(mockedDraftGenerationService);
      reset(mockedRouter);
      when(mockedDraftGenerationService.startBuildOrGetActiveBuild(anything())).thenReturn(of(undefined));
    });

    it('sends chapter-level translation range for a partially drafted book', fakeAsync(() => {
      const env = new TestEnvironment(testState);
      tick(); // runs logicHandler.init() and component.init() to completion (sets initData)
      // GEN: source has chapters 1-50, target has 1-5 -> default draft selection is 6-50
      env.component.logicHandler.selectDraftingBooks(['GEN']);

      env.component.generateDraftClicked();
      tick();

      verify(
        mockedDraftGenerationService.startBuildOrGetActiveBuild(
          deepEqual({
            projectId: 'testProjectId',
            translationScriptureRanges: [{ projectId: 'draft-source-1-id', scriptureRange: 'GEN6-50' }],
            trainingScriptureRanges: [{ projectId: 'testProjectId', scriptureRange: '' }],
            trainingDataFiles: [],
            availableTrainingDataFiles: [],
            fastTraining: false,
            useEcho: false,
            sendEmailOnBuildFinished: false
          })
        )
      ).once();
      expect().nothing();
    }));

    it('includes chapter-level target training range and book-level training source ranges', fakeAsync(() => {
      const env = new TestEnvironment(testState);
      tick();
      // Draft GEN 6-50; target training defaults to non-drafted chapters GEN 1-5
      env.component.logicHandler.selectDraftingBooks(['GEN']);
      env.component.logicHandler.setInputMode('training_books');
      env.component.logicHandler.selectTargetTrainingBooks(['GEN']);
      env.component.logicHandler.selectTrainingSourceBooks('training-source-1-id', ['GEN']);

      env.component.generateDraftClicked();
      tick();

      verify(
        mockedDraftGenerationService.startBuildOrGetActiveBuild(
          deepEqual({
            projectId: 'testProjectId',
            translationScriptureRanges: [{ projectId: 'draft-source-1-id', scriptureRange: 'GEN6-50' }],
            trainingScriptureRanges: [
              { projectId: 'training-source-1-id', scriptureRange: 'GEN' },
              { projectId: 'testProjectId', scriptureRange: 'GEN1-5' }
            ],
            trainingDataFiles: [],
            availableTrainingDataFiles: [],
            fastTraining: false,
            useEcho: false,
            sendEmailOnBuildFinished: false
          })
        )
      ).once();
      expect().nothing();
    }));

    it('navigates to draft-generation after submitting the build', fakeAsync(() => {
      const env = new TestEnvironment(testState);
      tick();
      env.component.logicHandler.selectDraftingBooks(['GEN']);

      env.component.generateDraftClicked();
      tick();

      verify(mockedRouter.navigate(deepEqual(['/projects', 'testProjectId', 'draft-generation']))).once();
      expect().nothing();
    }));

    it('does not call the backend when offline', fakeAsync(() => {
      const env = new TestEnvironment(testState);
      tick();
      env.onlineStatusService.setIsOnline(false);

      env.component.generateDraftClicked();
      tick();

      verify(mockedDraftGenerationService.startBuildOrGetActiveBuild(anything())).never();
      expect().nothing();
    }));

    it('sends the selected files and the full available set of training data files', fakeAsync(() => {
      const env = new TestEnvironment({
        ...testState,
        trainingDataFiles: [makeTrainingData('a'), makeTrainingData('b'), makeTrainingData('c')],
        // 'a' was used last time; 'b' was offered but deselected; 'c' is newly added
        lastSelectedTrainingDataFiles: ['a'],
        lastAvailableTrainingDataFiles: ['a', 'b']
      });
      tick();
      env.component.logicHandler.selectDraftingBooks(['GEN']);

      env.component.generateDraftClicked();
      tick();

      const [config] = capture(mockedDraftGenerationService.startBuildOrGetActiveBuild).last();
      // 'a' (used last time) and 'c' (new) default selected; 'b' (deselected last time) stays off
      expect(config.trainingDataFiles).toEqual(['a', 'c']);
      // The full set offered is always reported so a later build can detect new vs deselected files
      expect(config.availableTrainingDataFiles).toEqual(['a', 'b', 'c']);
    }));
  });

  describe('training data file selection', () => {
    it('defaults selection from the last build, keeping used and newly added files', fakeAsync(() => {
      const env = new TestEnvironment({
        ...testState,
        trainingDataFiles: [makeTrainingData('a'), makeTrainingData('b'), makeTrainingData('c')],
        lastSelectedTrainingDataFiles: ['a'],
        lastAvailableTrainingDataFiles: ['a', 'b']
      });
      tick();

      expect(env.component.isTrainingDataFileSelected('a')).toBe(true); // used last time
      expect(env.component.isTrainingDataFileSelected('b')).toBe(false); // deselected last time
      expect(env.component.isTrainingDataFileSelected('c')).toBe(true); // newly added
    }));

    it('selects all files for a legacy config with no recorded available set', fakeAsync(() => {
      const env = new TestEnvironment({
        ...testState,
        trainingDataFiles: [makeTrainingData('a'), makeTrainingData('b')],
        lastSelectedTrainingDataFiles: [],
        lastAvailableTrainingDataFiles: undefined
      });
      tick();

      expect(env.component.isTrainingDataFileSelected('a')).toBe(true);
      expect(env.component.isTrainingDataFileSelected('b')).toBe(true);
    }));

    it('toggles a file selection on and off', fakeAsync(() => {
      const env = new TestEnvironment({
        ...testState,
        trainingDataFiles: [makeTrainingData('a')],
        lastSelectedTrainingDataFiles: ['a'],
        lastAvailableTrainingDataFiles: ['a']
      });
      tick();

      env.component.onTrainingDataFileToggled('a', false);
      expect(env.component.isTrainingDataFileSelected('a')).toBe(false);
      env.component.onTrainingDataFileToggled('a', true);
      expect(env.component.isTrainingDataFileSelected('a')).toBe(true);
    }));

    it('prunes the selection when a file is removed, without re-running the defaults', fakeAsync(() => {
      const trainingData$ = new BehaviorSubject<TrainingData[]>([makeTrainingData('a'), makeTrainingData('b')]);
      const env = new TestEnvironment(
        { ...testState, lastSelectedTrainingDataFiles: ['a', 'b'], lastAvailableTrainingDataFiles: ['a', 'b'] },
        { trainingData$ }
      );
      tick();

      expect(env.component.isTrainingDataFileSelected('a')).toBe(true);
      expect(env.component.isTrainingDataFileSelected('b')).toBe(true);

      // 'b' is deleted from the project after the wizard has already loaded
      trainingData$.next([makeTrainingData('a')]);
      tick();

      expect(env.component.trainingDataFiles.map(f => f.dataId)).toEqual(['a']);
      expect(env.component.isTrainingDataFileSelected('a')).toBe(true);
      // The removed file is dropped from the selection rather than lingering
      expect(env.component.isTrainingDataFileSelected('b')).toBe(false);
    }));
  });

  describe('detectPendingUpdates', () => {
    // Reset call history so the per-test verify() counts aren't inflated by other tests' init flows.
    beforeEach(() => {
      reset(mockedParatextService);
      reset(mockedErrorReportingService);
    });

    it('shows the pending-updates page for an involved, connected project with an update', fakeAsync(() => {
      const env = new TestEnvironment(testState, {
        projects: [makeParatextProject({ projectId: 'draft-source-1-id', name: 'Draft Source 1', hasUpdate: true })]
      });
      tick();

      expect(env.component.page).toEqual('pending_updates');
      expect(env.component.pendingProjects).toEqual([{ projectId: 'draft-source-1-id', name: 'Draft Source 1' }]);
    }));

    it('excludes projects that are not involved, not connected, or have no update', fakeAsync(() => {
      const env = new TestEnvironment(testState, {
        projects: [
          makeParatextProject({ projectId: 'unrelated-id', hasUpdate: true }), // not involved
          makeParatextProject({ projectId: 'draft-source-1-id', isConnected: false, hasUpdate: true }), // not connected
          makeParatextProject({ projectId: 'training-source-1-id', hasUpdate: false }), // no update
          makeParatextProject({ projectId: null, hasUpdate: true }) // no SF project id
        ]
      });
      tick();

      expect(env.component.pendingProjects).toEqual([]);
      expect(env.component.page).toEqual('preface');
    }));

    it('falls back to shortName when the project name is empty', fakeAsync(() => {
      const env = new TestEnvironment(testState, {
        projects: [makeParatextProject({ projectId: 'testProjectId', name: '', shortName: 'TGT', hasUpdate: true })]
      });
      tick();

      expect(env.component.pendingProjects).toEqual([{ projectId: 'testProjectId', name: 'TGT' }]);
    }));

    it('skips detection entirely when offline', fakeAsync(() => {
      const env = new TestEnvironment(testState, {
        offline: true,
        projects: [makeParatextProject({ projectId: 'draft-source-1-id', hasUpdate: true })]
      });
      tick();

      expect(env.component.pendingProjects).toEqual([]);
      expect(env.component.page).toEqual('preface');
      verify(mockedParatextService.getProjects()).never();
    }));

    it('proceeds to the preface page when getProjects fails', fakeAsync(() => {
      const env = new TestEnvironment(testState, { getProjectsError: true });
      tick();

      expect(env.component.page).toEqual('preface');
      verify(mockedErrorReportingService.silentError(anything(), anything())).once();
    }));
  });

  describe('abort handling', () => {
    // Reset call history so the per-test verify() counts aren't inflated by other tests' flows.
    beforeEach(() => {
      reset(mockedRouter);
      reset(mockedErrorHandler);
    });

    it('shows the abort screen with no_access mode when a project is inaccessible', fakeAsync(() => {
      const env = new TestEnvironment(testState, { noAccessSources: true });
      tick();

      expect(env.component.page).toEqual('abort');
      expect(env.component.abortMode).toEqual('no_access');
    }));

    it('exposes the inaccessible project names for the abort screen', fakeAsync(() => {
      const env = new TestEnvironment(testState, { noAccessSources: true });
      tick();

      expect(env.component.inaccessibleProjectNames).toEqual(['Inaccessible Source']);
    }));

    it('navigates back to draft generation from the no_access abort screen', fakeAsync(() => {
      const env = new TestEnvironment(testState, { noAccessSources: true });
      tick();

      env.component.goBack();

      verify(mockedRouter.navigate(deepEqual(['/projects', 'testProjectId', 'draft-generation']))).once();
      expect().nothing();
    }));

    it('delegates to the global error handler and navigates back when initialization fails', fakeAsync(() => {
      const env = new TestEnvironment(testState, { progressError: true });
      tick();

      // Fatal/unanticipated failures go to the app-wide error dialog rather than a bespoke abort screen.
      verify(mockedErrorHandler.handleError(anything())).once();
      verify(mockedRouter.navigate(deepEqual(['/projects', 'testProjectId', 'draft-generation']))).once();
      expect(env.component.page).not.toEqual('abort');
    }));
  });

  describe('onPendingUpdatesComplete', () => {
    beforeEach(() => {
      reset(mockedRouter);
      reset(mockedErrorHandler);
    });

    it('re-derives progress fresh for the synced projects, then shows the preface', fakeAsync(() => {
      const env = new TestEnvironment(testState);
      tick();
      resetCalls(mockedProgressService); // ignore the calls made during init

      void env.component.onPendingUpdatesComplete(['draft-source-1-id']);
      tick();

      // The reload re-fetches and forces fresh data (maxStalenessMs: 0) for the synced project.
      verify(mockedProgressService.getProgressForProject('draft-source-1-id', deepEqual({ maxStalenessMs: 0 }))).once();
      expect(env.component.page).toEqual('preface');
    }));

    it('skips the reload and goes straight to the preface when nothing was synced', fakeAsync(() => {
      const env = new TestEnvironment(testState);
      tick();
      resetCalls(mockedProgressService);

      void env.component.onPendingUpdatesComplete([]);
      tick();

      verify(mockedProgressService.getProgressForProject(anything(), anything())).never();
      expect(env.component.page).toEqual('preface');
    }));

    it('routes a reload failure to the global error handler and navigates back', fakeAsync(() => {
      const env = new TestEnvironment(testState);
      tick();
      // Init has already succeeded; make the reload's progress fetch fail.
      when(mockedProgressService.getProgressForProject('draft-source-1-id', anything())).thenReject(
        new Error('reload failed')
      );

      void env.component.onPendingUpdatesComplete(['draft-source-1-id']);
      tick();

      verify(mockedErrorHandler.handleError(anything())).once();
      verify(mockedRouter.navigate(deepEqual(['/projects', 'testProjectId', 'draft-generation']))).once();
      expect().nothing();
    }));
  });

  describe('hidden-books notices', () => {
    it('counts only the surfaced drafting-exclusion reasons (not non-canonical)', fakeAsync(() => {
      const env = new TestEnvironment(testState);
      tick();
      env.component.logicHandler.excludedDraftingBooks$.next([
        { bookId: 'GEN', reason: 'no_source_content' },
        { bookId: 'EXO', reason: 'not_in_target' },
        { bookId: 'FRT', reason: 'non_canonical' } // tracked but never surfaced
      ]);

      expect(env.component.draftingHiddenBookCount).toBe(2);
      expect(env.component.draftingExclusionNotices.length).toBe(2);
    }));

    it('counts target training books hidden for lacking a matching source', fakeAsync(() => {
      const env = new TestEnvironment(testState);
      tick();
      env.component.logicHandler.targetTrainingBooksWithoutSource$.next(['LEV', 'NUM']);

      expect(env.component.targetTrainingHiddenBookCount).toBe(2);
      expect(env.component.hasTargetTrainingBooksWithoutSource).toBeTrue();
    }));

    it('starts with the explanations collapsed on both steps', fakeAsync(() => {
      const env = new TestEnvironment(testState);
      tick();

      expect(env.component.draftingExclusionsExpanded).toBeFalse();
      expect(env.component.trainingExclusionsExpanded).toBeFalse();
    }));
  });
});

const mockedActivatedProjectService = mock(ActivatedProjectService);
const mockedDraftSourcesService = mock(DraftSourcesService);
const mockedDraftGenerationService = mock(DraftGenerationService);
const mockedProgressService = mock(DraftProgressService);
const mockedI18nService = mock(I18nService);
const mockedFeatureFlagService = mock(FeatureFlagService);
const mockedUserService = mock(UserService);
const mockedRouter = mock(Router);
const mockedNllbLanguageService = mock(NllbLanguageService);
const mockedParatextService = mock(ParatextService);
const mockedErrorReportingService = mock(ErrorReportingService);
const mockedErrorHandler = mock<ErrorHandler>(ErrorHandler);
const mockedTrainingDataService = mock(TrainingDataService);

interface TestState {
  draftingSourceBooksChapters: string;
  targetProjectBooksChapters: string;
  trainingSourcesBooksChapters: { [key: string]: string };
  draftingSourceCopyrightBanner?: string;
  trainingSourceCopyrightBanners?: { [key: string]: string };
  /** Training data files currently available for the project. */
  trainingDataFiles?: TrainingData[];
  lastSelectedTrainingDataFiles?: string[];
  lastAvailableTrainingDataFiles?: string[];
  /** Target books getCompleteBookIds should report as complete (auto-selectable on first draft). Defaults to none. */
  completeTargetBooks?: string[];
}

function makeTrainingData(dataId: string, title: string = dataId): TrainingData {
  return {
    dataId,
    title,
    projectRef: 'testProjectId',
    ownerRef: 'user01',
    fileUrl: `https://example.com/${dataId}.csv`,
    mimeType: 'text/csv',
    skipRows: 0
  };
}

// `hasUpdate` is required so each call states explicitly whether the project has a pending update.
function makeParatextProject(
  overrides: Partial<ParatextProject> & Pick<ParatextProject, 'hasUpdate'>
): ParatextProject {
  return {
    paratextId: 'pt-id',
    name: 'A Project',
    shortName: 'PRJ',
    languageTag: 'en',
    projectId: 'sf-project-id',
    isConnectable: true,
    isConnected: true,
    hasUserRoleChanged: false,
    role: SFProjectRole.ParatextAdministrator,
    ...overrides
  };
}

class TestEnvironment {
  component: NewDraftComponent;
  readonly onlineStatusService = TestBed.inject(TestOnlineStatusService);

  constructor(
    state: TestState,
    options: {
      getProjectsError?: boolean;
      projects?: ParatextProject[];
      offline?: boolean;
      noAccessSources?: boolean;
      progressError?: boolean;
      /** When true, both languages are treated as NLLB languages so that training is optional. */
      trainingOptional?: boolean;
      /** Overrides the training-data stream so a test can emit changes over time (e.g. a file being removed). */
      trainingData$?: Observable<TrainingData[]>;
    } = {}
  ) {
    const project = createTestProjectProfile({
      shortName: TARGET_SHORT_NAME,
      translateConfig: {
        preTranslate: true,
        draftConfig: {
          draftingSources: [
            {
              paratextId: 'draft-source-1-pt-id',
              projectRef: 'draft-source-1-id',
              name: 'Draft Source 1',
              shortName: SOURCE_SHORT_NAME,
              writingSystem: { script: 'Latn', tag: 'es' }
            }
          ],
          trainingSources: Object.keys(state.trainingSourcesBooksChapters).map(projectId => ({
            paratextId: `${projectId}-pt-id`,
            projectRef: projectId,
            name: `Training Source for ${projectId}`,
            shortName: `TS-${projectId}`,
            writingSystem: { script: 'Latn', tag: 'es' }
          })),
          lastSelectedTrainingScriptureRanges: [],
          lastSelectedTrainingDataFiles: state.lastSelectedTrainingDataFiles ?? [],
          lastAvailableTrainingDataFiles: state.lastAvailableTrainingDataFiles,
          lastSelectedTranslationScriptureRanges: undefined
        }
      }
    });

    const projectId = 'testProjectId';
    when(mockedActivatedProjectService.projectId).thenReturn(projectId);
    when(mockedActivatedProjectService.projectId$).thenReturn(of(projectId));
    when(mockedActivatedProjectService.projectDoc).thenReturn({ data: project } as SFProjectProfileDoc);
    when(mockedActivatedProjectService.projectDoc$).thenReturn(of({ data: project } as SFProjectProfileDoc));

    if (options.noAccessSources) {
      when(mockedDraftSourcesService.getDraftProjectSources()).thenReturn(
        of({
          trainingSources: [{ noAccess: true, name: 'Inaccessible Source' } as unknown as DraftSource],
          trainingTargets: [],
          draftingSources: []
        })
      );
    } else {
      when(mockedDraftSourcesService.getDraftProjectSources()).thenReturn(
        of({
          trainingSources: Object.keys(state.trainingSourcesBooksChapters).map(projectId => ({
            paratextId: `${projectId}-pt-id`,
            projectRef: projectId,
            name: `Training Source for ${projectId}`,
            shortName: `TS-${projectId}`,
            writingSystem: { script: 'Latn', tag: 'es' },
            texts: [],
            copyrightBanner: state.trainingSourceCopyrightBanners?.[projectId]
          })) as DraftSource[],
          trainingTargets: [],
          draftingSources: [
            {
              paratextId: 'draft-source-1-pt-id',
              projectRef: 'draft-source-1-id',
              name: 'Draft Source 1',
              shortName: SOURCE_SHORT_NAME,
              writingSystem: { script: 'Latn', tag: 'es' },
              texts: [],
              copyrightBanner: state.draftingSourceCopyrightBanner
            } as DraftSource
          ]
        })
      );
    }

    if (options.progressError) {
      when(mockedProgressService.getProgressForProject(projectId, anything())).thenReject(new Error('progress failed'));
    } else {
      when(mockedProgressService.getProgressForProject(projectId, anything())).thenResolve(
        new VerboseScriptureRange(state.targetProjectBooksChapters)
      );
    }
    when(mockedProgressService.getProgressForProject('draft-source-1-id', anything())).thenResolve(
      new VerboseScriptureRange(state.draftingSourceBooksChapters)
    );
    for (const [trainingSourceId, booksChapters] of Object.entries(state.trainingSourcesBooksChapters)) {
      when(mockedProgressService.getProgressForProject(trainingSourceId, anything())).thenResolve(
        new VerboseScriptureRange(booksChapters)
      );
    }
    when(mockedProgressService.getCompleteBookIds(projectId, anything())).thenResolve(
      new Set(state.completeTargetBooks ?? [])
    );

    when(mockedTrainingDataService.getTrainingData(anything(), anything())).thenReturn(
      options.trainingData$ ?? of(state.trainingDataFiles ?? [])
    );

    when(mockedFeatureFlagService.showDeveloperTools).thenReturn(createTestFeatureFlag(false));
    when(mockedUserService.getCurrentUser()).thenResolve(undefined as any);
    when(mockedNllbLanguageService.isNllbLanguageAsync(anything())).thenResolve(options.trainingOptional === true);
    // Set the online state before the component is constructed so init()'s online check sees it.
    this.onlineStatusService.setIsOnline(!options.offline);
    if (options.getProjectsError) {
      when(mockedParatextService.getProjects()).thenReject(new Error('network error'));
    } else {
      when(mockedParatextService.getProjects()).thenResolve(options.projects);
    }

    this.component = new NewDraftComponent(
      instance(mockedActivatedProjectService),
      instance(mockedDraftSourcesService),
      instance(mockedDraftGenerationService),
      instance(mockedProgressService),
      instance(mockedI18nService),
      instance(mockedFeatureFlagService),
      this.onlineStatusService,
      instance(mockedUserService),
      instance(mockedRouter),
      instance(mockedNllbLanguageService),
      instance(mockedParatextService),
      instance(mockedErrorReportingService),
      instance(mockedErrorHandler),
      instance(mockedTrainingDataService),
      { onDestroy: () => () => {} } as unknown as DestroyRef
    );
  }

  async waitForInit(): Promise<void> {
    await firstValueFrom(this.component.logicHandler.status$.pipe(filter(s => s === 'input')));
  }

  /** Selects GEN for drafting (GEN6-50) and GEN for training (GEN1-5 available). */
  async selectGENForTraining(): Promise<void> {
    this.component.logicHandler.selectDraftingBooks(['GEN']);
    this.component.logicHandler.setInputMode('training_books');
    this.component.logicHandler.selectTargetTrainingBooks(['GEN']);
  }

  availableTrainingSourceBookIds(projectId: string): string[] {
    return this.component.availableTrainingSourceBooksForProject(projectId).map(b => Canon.bookNumberToId(b.number));
  }

  selectedTrainingSourceBookIds(projectId: string): string[] {
    return this.component.selectedTrainingSourceBooksForProject(projectId).map(b => Canon.bookNumberToId(b.number));
  }

  get selectedDraftingScriptureRange(): string {
    return this.component.logicHandler.selectedDraftingScriptureRange$.getValue().toString();
  }

  get selectedTargetTrainingScriptureRange(): string {
    return this.component.logicHandler.selectedTargetTrainingScriptureRange$.getValue().toString();
  }
}
