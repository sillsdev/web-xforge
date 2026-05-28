import { Canon } from '@sillsdev/scripture';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { ProjectScriptureRange } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { filter, firstValueFrom, of } from 'rxjs';
import { instance, mock, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { SFProjectService } from '../../../core/sf-project.service';
import { chapterCounts } from '../../../shared/progress-service/progress.service';
import { DraftSource } from '../draft-source';
import { DraftSourcesService } from '../draft-sources.service';
import { NewDraftLogicHandler, ProgressServiceThatGivesChapterLevelInfo } from './new-draft-logic-handler';
import { VerboseScriptureRange } from './scripture-range';

function allBooksExcept(excludedBooks: string[]): string {
  return new VerboseScriptureRange(
    Canon.allBookIds
      .filter(book => Canon.isBookOTNT(Canon.bookIdToNumber(book)) && !excludedBooks.includes(book))
      .map(book => `${book}1-${chapterCounts[book]}`)
      .join(';')
  ).toString();
}

const FULL_CANON_SCRIPTURE_RANGE = allBooksExcept([]);

describe('NewDraftLogicHandler', () => {
  const teamStartingToTranslateGenesis = {
    lastSelectedTranslationScriptureRanges: [{ projectId: 'draft-source-1-id', scriptureRange: 'GEN' }],
    previouslySelectedTrainingScriptureRanges: [
      { projectId: 'training-source-1-id', scriptureRange: 'MAT;MRK;LUK;JHN' }
    ],
    draftingSourceBooksChapters: FULL_CANON_SCRIPTURE_RANGE,
    targetProjectBooksChapters: 'GEN1-5;MAT1-28;MRK1-16;LUK1-24;JHN1-21',
    trainingSourcesBooksChapters: {
      'training-source-1-id': FULL_CANON_SCRIPTURE_RANGE
    }
  } as const satisfies TestState;

  const teamWithTwoTrainingSources = {
    lastSelectedTranslationScriptureRanges: undefined,
    previouslySelectedTrainingScriptureRanges: [
      { projectId: 'training-source-1-id', scriptureRange: 'MAT;MRK' },
      { projectId: 'training-source-2-id', scriptureRange: 'LUK;JHN' }
    ],
    draftingSourceBooksChapters: FULL_CANON_SCRIPTURE_RANGE,
    targetProjectBooksChapters: 'GEN1-5;MAT1-28;MRK1-16;LUK1-24;JHN1-21',
    trainingSourcesBooksChapters: {
      'training-source-1-id': FULL_CANON_SCRIPTURE_RANGE,
      'training-source-2-id': FULL_CANON_SCRIPTURE_RANGE
    }
  } as const satisfies TestState;

  describe('initialization', () => {
    it('aborts when a source project is inaccessible', async () => {
      const env = new TestEnvironment({ ...teamStartingToTranslateGenesis, noAccessSources: true });
      await env.waitForAbort();

      expect(env.logicHandler.status$.getValue()).toBe('abort');
      expect(env.logicHandler.abortMode$.getValue()).toBe('no_access');
    });

    it('initializes available ranges based on progress service', async () => {
      const testState = teamStartingToTranslateGenesis;
      const env = new TestEnvironment(testState);
      await env.waitForInit();

      // Ranges availble for selection should be set automatically upon init
      expect(env.availableDraftingScriptureRange).toBe(testState.draftingSourceBooksChapters);
      expect(env.availableTargetTrainingScriptureRange).toBe(testState.targetProjectBooksChapters);

      // Selections should be blank
      expect(env.selectedDraftingScriptureRange).toBe('');
      expect(env.selectedTargetTrainingScriptureRange).toBe('');
    });
  });

  describe('selectDraftingBooks', () => {
    it('allows selecting books and chapters within the available ranges', async () => {
      const testState = teamStartingToTranslateGenesis;
      const env = new TestEnvironment(testState);
      await env.waitForInit();

      // Select Genesis for drafting
      env.logicHandler.selectDraftingBooks(['GEN']);
      // Remaining undrafted chapters automatically selected
      expect(env.selectedDraftingScriptureRange).toBe('GEN6-50');
    });

    it('offers to draft a subset of chapters of a partially completed book and defaults to the remaining undrafted chapters', async () => {
      const testState = teamStartingToTranslateGenesis;
      const env = new TestEnvironment(testState);
      await env.waitForInit();

      env.logicHandler.selectDraftingBooks(['GEN']);

      expect(env.booksOfferedForPartialDrafting).toEqual(['GEN']);
      expect(env.selectedDraftingScriptureRange).toBe('GEN6-50');
    });

    it('does not offer to draft a subset of chapters of a book that has not been started', async () => {
      const testState = teamStartingToTranslateGenesis;
      const env = new TestEnvironment(testState);
      await env.waitForInit();

      env.logicHandler.selectDraftingBooks(['EXO']);

      expect(env.selectedDraftingScriptureRange).toBe('EXO1-40');
      expect(env.booksOfferedForPartialDrafting).toEqual([]);
    });

    it('offers to draft a subset of chapters of a book that has been completed and defaults to all chapters', async () => {
      const testState = {
        ...teamStartingToTranslateGenesis,
        targetProjectBooksChapters: teamStartingToTranslateGenesis.targetProjectBooksChapters.replace(
          'GEN1-5',
          'GEN1-50'
        )
      };
      const env = new TestEnvironment(testState);
      await env.waitForInit();

      env.logicHandler.selectDraftingBooks(['GEN']);

      expect(env.booksOfferedForPartialDrafting).toEqual(['GEN']);
      expect(env.selectedDraftingScriptureRange).toBe('GEN1-50');
    });

    it('allows selecting multiple books for drafting and only offers to draft subsets of books that have some progress', async () => {
      const testState = teamStartingToTranslateGenesis;
      const env = new TestEnvironment(testState);
      await env.waitForInit();

      // User selects GEN and then EXO
      env.logicHandler.selectDraftingBooks(['GEN']);
      env.logicHandler.selectDraftingBooks(['GEN', 'EXO']);

      // User should be able to select both GEN and EXO for drafting, but only GEN should be offered for partial drafting since EXO has no progress
      expect(env.booksOfferedForPartialDrafting).toEqual(['GEN']);
      expect(env.selectedDraftingScriptureRange).toBe('GEN6-50;EXO1-40');
    });

    it('defaults to remaining undrafted chapters when re-selecting a book after visiting the training step', async () => {
      // Target has all 50 chapters of Genesis — nothing left to draft
      const testState = {
        ...teamStartingToTranslateGenesis,
        targetProjectBooksChapters: 'GEN1-50;MAT1-28;MRK1-16;LUK1-24;JHN1-21'
      };
      const env = new TestEnvironment(testState);
      await env.waitForInit();

      // Selecting GEN defaults to all 50 chapters (source - target = 0 → fallback to all)
      env.logicHandler.selectDraftingBooks(['GEN']);
      expect(env.selectedDraftingScriptureRange).toBe('GEN1-50');

      // User manually narrows the selection to just GEN1-30
      env.logicHandler.selectDraftingChapters('GEN', '1-30');
      expect(env.selectedDraftingScriptureRange).toBe('GEN1-30');

      // Visit training step — GEN1-30 is subtracted from the available target training range
      env.logicHandler.setInputMode('training_books');
      expect(env.availableTargetTrainingScriptureRange).toBe('GEN31-50;MAT1-28;MRK1-16;LUK1-24;JHN1-21');
      env.logicHandler.setInputMode('draft_books');

      // Deselect then re-select GEN — default should be all 50 chapters since target has all of them
      env.logicHandler.selectDraftingBooks([]);
      env.logicHandler.selectDraftingBooks(['GEN']);
      expect(env.selectedDraftingScriptureRange).toBe('GEN1-50');
    });
  });

  describe('selectDraftingChapters', () => {
    it('allows selecting which chapters in a book should be drafted when offering partial drafting of a book', async () => {
      const testState = teamStartingToTranslateGenesis;
      const env = new TestEnvironment(testState);
      await env.waitForInit();

      // User selects GEN for drafting, which offers partial drafting since GEN1-5 is completed
      env.logicHandler.selectDraftingBooks(['GEN']);
      expect(env.booksOfferedForPartialDrafting).toEqual(['GEN']);

      // Expect the chapter range to be set by default to the chapters that are not completed
      expect(env.selectedDraftingScriptureRange).toBe('GEN6-50');

      // User selects to draft a different range of chapters in GEN
      env.logicHandler.selectDraftingChapters('GEN', '7,20-50');
      expect(env.selectedDraftingScriptureRange).toBe('GEN7,20-50');
    });

    it('throws for an invalid chapter range string', async () => {
      const env = new TestEnvironment(teamStartingToTranslateGenesis);
      await env.waitForInit();

      env.logicHandler.selectDraftingBooks(['GEN']);

      expect(() => env.logicHandler.selectDraftingChapters('GEN', 'abc')).toThrow();
    });

    it('throws when selected chapters are outside the available source range', async () => {
      const env = new TestEnvironment(teamStartingToTranslateGenesis);
      await env.waitForInit();

      env.logicHandler.selectDraftingBooks(['GEN']);

      // GEN only has 50 chapters in the source
      expect(() => env.logicHandler.selectDraftingChapters('GEN', '51-60')).toThrow();
    });

    it('throws when the book is not eligible for partial drafting', async () => {
      const env = new TestEnvironment(teamStartingToTranslateGenesis);
      await env.waitForInit();

      // EXO has no target progress, so partial drafting is not offered
      env.logicHandler.selectDraftingBooks(['EXO']);
      expect(env.booksOfferedForPartialDrafting).toEqual([]);

      expect(() => env.logicHandler.selectDraftingChapters('EXO', '1-10')).toThrow();
    });
  });

  describe('training book selection', () => {
    it('defaults to previous training data when going to the training step', async () => {
      const testState = teamStartingToTranslateGenesis;
      const env = new TestEnvironment(testState);
      await env.waitForInit();

      // Initially no training books selected
      expect(env.selectedTargetTrainingScriptureRange).toBe('');
      expect(env.selectedTrainingSourceBooks).toEqual({});

      // Previous training selections should be selected by default when going to the training step
      env.logicHandler.setInputMode('training_books');
      expect(env.selectedTargetTrainingScriptureRange).toBe('MAT1-28;MRK1-16;LUK1-24;JHN1-21');
      expect(env.selectedTrainingSourceBooks).toEqual({ 'training-source-1-id': ['MAT', 'MRK', 'LUK', 'JHN'] });
    });

    it('does not automatically select training data that was previously selected but is no longer available in the training sources', async () => {
      const testState = {
        ...teamStartingToTranslateGenesis,
        trainingSourcesBooksChapters: {
          'training-source-1-id': allBooksExcept(['MAT'])
        }
      };
      expect(testState.trainingSourcesBooksChapters['training-source-1-id']).not.toContain('MAT');
      const env = new TestEnvironment(testState);
      await env.waitForInit();

      env.logicHandler.setInputMode('training_books');

      // The previously selected training data included MAT, but since that's now unavailable, it should not be selected
      expect(env.availableTrainingSourceBooks).toEqual({ 'training-source-1-id': ['GEN', 'MRK', 'LUK', 'JHN'] });
      expect(env.selectedTargetTrainingScriptureRange).toBe('MRK1-16;LUK1-24;JHN1-21');
      expect(env.selectedTrainingSourceBooks).toEqual({ 'training-source-1-id': ['MRK', 'LUK', 'JHN'] });
    });

    it('does not automatically select training data that was previously selected but is now selected to be drafted', async () => {
      const testState = teamStartingToTranslateGenesis;
      const env = new TestEnvironment(testState);
      await env.waitForInit();

      env.logicHandler.selectDraftingBooks(['MAT']);

      env.logicHandler.setInputMode('training_books');

      // The previously selected training data includes MAT, but since that's now selected as drafting material, it should
      // not be selected as training material
      expect(env.availableTargetTrainingScriptureRange).toBe('GEN1-5;MRK1-16;LUK1-24;JHN1-21');
      expect(env.selectedTargetTrainingScriptureRange).toBe('MRK1-16;LUK1-24;JHN1-21');
      expect(env.selectedTrainingSourceBooks).toEqual({ 'training-source-1-id': ['MRK', 'LUK', 'JHN'] });
    });

    it('limits the selection of training data to what is available in the training sources and not selected for drafting', async () => {
      const testState = teamStartingToTranslateGenesis;
      const env = new TestEnvironment(testState);
      await env.waitForInit();

      // User selects MAT for drafting, which should remove it from the available training data since it's not possible to both draft and train on the same material
      env.logicHandler.selectDraftingBooks(['MAT']);

      env.logicHandler.setInputMode('training_books');

      expect(env.availableTargetTrainingScriptureRange).toBe('GEN1-5;MRK1-16;LUK1-24;JHN1-21');
      expect(env.selectedTargetTrainingScriptureRange).toBe('MRK1-16;LUK1-24;JHN1-21');
      expect(env.selectedTrainingSourceBooks).toEqual({ 'training-source-1-id': ['MRK', 'LUK', 'JHN'] });

      // Go back and select Genesis instead
      env.logicHandler.setInputMode('draft_books');
      env.logicHandler.selectDraftingBooks(['GEN']);
      expect(env.selectedDraftingScriptureRange).toBe('GEN6-50');
      env.logicHandler.setInputMode('training_books');

      // Now GEN should be removed from the available training data instead of MAT
      expect(env.availableTargetTrainingScriptureRange).toBe('GEN1-5;MAT1-28;MRK1-16;LUK1-24;JHN1-21');
      expect(env.selectedTargetTrainingScriptureRange).toBe('MRK1-16;LUK1-24;JHN1-21');
      expect(env.selectedTrainingSourceBooks).toEqual({ 'training-source-1-id': ['MRK', 'LUK', 'JHN'] });
    });

    it('reallows training data to be selected when it is deselected for drafting', async () => {
      const testState = teamStartingToTranslateGenesis;
      const env = new TestEnvironment(testState);
      await env.waitForInit();

      // User selects GEN and MRK for drafting, which should remove both from the available training data since it's not possible to both draft and train on the same material
      env.logicHandler.selectDraftingBooks(['GEN']);
      env.logicHandler.selectDraftingBooks(['GEN', 'MRK']);
      expect(env.selectedDraftingScriptureRange).toBe('GEN6-50;MRK1-16');

      // Go to training step and see that MRK is not available for training
      env.logicHandler.setInputMode('training_books');
      expect(env.availableTargetTrainingScriptureRange).toBe('GEN1-5;MAT1-28;LUK1-24;JHN1-21');
      expect(env.selectedTargetTrainingScriptureRange).toBe('MAT1-28;LUK1-24;JHN1-21');
      expect(env.selectedTrainingSourceBooks).toEqual({ 'training-source-1-id': ['MAT', 'LUK', 'JHN'] });

      // Go back and deselect MRK for drafting
      env.logicHandler.setInputMode('draft_books');
      env.logicHandler.selectDraftingBooks(['GEN']);
      expect(env.selectedDraftingScriptureRange).toBe('GEN6-50');

      // Now MRK should be available again in the training data
      env.logicHandler.setInputMode('training_books');
      expect(env.availableTargetTrainingScriptureRange).toBe('GEN1-5;MAT1-28;MRK1-16;LUK1-24;JHN1-21');
    });

    it('restores previously selected books independently for each training source', async () => {
      const env = new TestEnvironment(teamWithTwoTrainingSources);
      await env.waitForInit();

      env.logicHandler.setInputMode('training_books');

      // Each source gets its own prior selection restored, with no cross-contamination
      expect(env.selectedTrainingSourceBooks).toEqual({
        'training-source-1-id': ['MAT', 'MRK'],
        'training-source-2-id': ['LUK', 'JHN']
      });
    });

    it('a book selected for drafting is excluded from all training sources', async () => {
      const testState = {
        ...teamWithTwoTrainingSources,
        previouslySelectedTrainingScriptureRanges: [
          { projectId: 'training-source-1-id', scriptureRange: 'MAT;MRK;LUK;JHN' },
          { projectId: 'training-source-2-id', scriptureRange: 'MAT;MRK;LUK;JHN' }
        ]
      };
      const env = new TestEnvironment(testState);
      await env.waitForInit();

      env.logicHandler.selectDraftingBooks(['MAT']);
      env.logicHandler.setInputMode('training_books');

      expect(env.selectedTrainingSourceBooks['training-source-1-id']).not.toContain('MAT');
      expect(env.selectedTrainingSourceBooks['training-source-2-id']).not.toContain('MAT');
    });

    it('filters a book from one source independently when it is absent from that source but present in another', async () => {
      const testState = {
        ...teamWithTwoTrainingSources,
        previouslySelectedTrainingScriptureRanges: [
          { projectId: 'training-source-1-id', scriptureRange: 'MAT' },
          { projectId: 'training-source-2-id', scriptureRange: 'MAT' }
        ],
        trainingSourcesBooksChapters: {
          'training-source-1-id': FULL_CANON_SCRIPTURE_RANGE,
          'training-source-2-id': allBooksExcept(['MAT'])
        }
      };
      const env = new TestEnvironment(testState);
      await env.waitForInit();

      env.logicHandler.setInputMode('training_books');

      // Source 1 still has MAT available and selected; source 2 does not
      expect(env.availableTrainingSourceBooks['training-source-1-id']).toContain('MAT');
      expect(env.availableTrainingSourceBooks['training-source-2-id']).not.toContain('MAT');
      expect(env.selectedTrainingSourceBooks['training-source-1-id']).toContain('MAT');
      expect(env.selectedTrainingSourceBooks['training-source-2-id']).not.toContain('MAT');
    });
  });

  describe('selectTargetTrainingChapters', () => {
    it('updates the selected target training scripture range', async () => {
      const env = new TestEnvironment(teamStartingToTranslateGenesis);
      await env.waitForInit();

      env.logicHandler.selectDraftingBooks(['GEN']); // defaults to GEN6-50
      env.logicHandler.setInputMode('training_books');
      env.logicHandler.selectTargetTrainingBooks(['GEN']); // GEN1-5 available for training

      env.logicHandler.selectTargetTrainingChapters('GEN', '1-3');
      expect(env.selectedTargetTrainingScriptureRange).toBe('GEN1-3');
    });

    it('throws when called in draft_books mode', async () => {
      const env = new TestEnvironment(teamStartingToTranslateGenesis);
      await env.waitForInit();

      env.logicHandler.selectDraftingBooks(['GEN']);
      // still in draft_books mode
      expect(() => env.logicHandler.selectTargetTrainingChapters('GEN', '1-3')).toThrow();
    });

    it('throws when selected chapters are outside the available target training range', async () => {
      const env = new TestEnvironment(teamStartingToTranslateGenesis);
      await env.waitForInit();

      env.logicHandler.selectDraftingBooks(['GEN']); // GEN6-50 drafted
      env.logicHandler.setInputMode('training_books');
      env.logicHandler.selectTargetTrainingBooks(['GEN']); // only GEN1-5 available for training

      // GEN6 is being drafted, so it's not available for target training
      expect(() => env.logicHandler.selectTargetTrainingChapters('GEN', '1-10')).toThrow();
    });

    it('throws when the book is not eligible for partial target training', async () => {
      const env = new TestEnvironment(teamStartingToTranslateGenesis);
      await env.waitForInit();

      env.logicHandler.selectDraftingBooks(['GEN']);
      env.logicHandler.setInputMode('training_books');
      // MAT is available for training but was not offered for partial drafting
      env.logicHandler.selectTargetTrainingBooks(['MAT']);
      expect(env.booksOfferedForPartialTargetTraining).toEqual([]);

      expect(() => env.logicHandler.selectTargetTrainingChapters('MAT', '1-10')).toThrow();
    });
  });

  describe('selectTargetTrainingBooks', () => {
    it('updates the selected target training range', async () => {
      const env = new TestEnvironment(teamStartingToTranslateGenesis);
      await env.waitForInit();

      env.logicHandler.setInputMode('training_books');
      env.logicHandler.selectTargetTrainingBooks(['MRK', 'LUK']);

      expect(env.selectedTargetTrainingScriptureRange).toBe('MRK1-16;LUK1-24');
    });

    it('throws when called in draft_books mode', async () => {
      const env = new TestEnvironment(teamStartingToTranslateGenesis);
      await env.waitForInit();

      expect(() => env.logicHandler.selectTargetTrainingBooks(['MAT'])).toThrow();
    });

    it('offers partial target training for a book that was partially drafted with target chapters remaining', async () => {
      const env = new TestEnvironment(teamStartingToTranslateGenesis);
      await env.waitForInit();

      // GEN: source has 50 chapters (≥12), target has GEN1-5 (≥1) — eligible for partial drafting
      env.logicHandler.selectDraftingBooks(['GEN']);
      expect(env.selectedDraftingScriptureRange).toBe('GEN6-50');

      env.logicHandler.setInputMode('training_books');
      // GEN1-5 remain available for target training since only GEN6-50 is being drafted
      env.logicHandler.selectTargetTrainingBooks(['GEN']);

      expect(env.booksOfferedForPartialTargetTraining).toEqual(['GEN']);
    });

    it('does not offer partial target training for books not offered for partial drafting', async () => {
      const env = new TestEnvironment(teamStartingToTranslateGenesis);
      await env.waitForInit();

      env.logicHandler.selectDraftingBooks(['GEN']);
      env.logicHandler.setInputMode('training_books');
      // MAT is available for target training but was not offered for partial drafting
      env.logicHandler.selectTargetTrainingBooks(['MAT']);

      expect(env.booksOfferedForPartialTargetTraining).toEqual([]);
    });
  });
});

const mockedActivatedProjectService = mock(ActivatedProjectService);
const mockedSFProjectService = mock(SFProjectService);
const mockedDraftSourcesService = mock(DraftSourcesService);
const mockedStubProgressServiceThatGivesChapterLevelInfo = mock(ProgressServiceThatGivesChapterLevelInfo);

interface TestState {
  lastSelectedTranslationScriptureRanges: ProjectScriptureRange[] | undefined;
  previouslySelectedTrainingScriptureRanges: ProjectScriptureRange[] | undefined;

  /** A scripture range specifying what books and chapters exist in the drafting source */
  draftingSourceBooksChapters: string;
  /** A scripture range specifying what books and chapters exist in the target project */
  targetProjectBooksChapters: string;

  /**
   * A mapping of project ID to scripture range specifying what books and chapters exist in each training source, keyed
   * by project ID.
   */
  trainingSourcesBooksChapters: { [key: string]: string };
  noAccessSources?: boolean;
}

class TestEnvironment {
  logicHandler: NewDraftLogicHandler;

  activatedProjectService = instance(mockedActivatedProjectService);
  sfProjectService = instance(mockedSFProjectService);
  draftSourcesService = instance(mockedDraftSourcesService);
  stubProgressServiceThatGivesChapterLevelInfo = instance(mockedStubProgressServiceThatGivesChapterLevelInfo);

  constructor(state: TestState) {
    const project = createTestProjectProfile({
      translateConfig: {
        preTranslate: true,
        draftConfig: {
          draftingSources: [
            {
              paratextId: 'draft-source-1-pt-id',
              projectRef: 'draft-source-1-id',
              name: 'Draft Source 1',
              shortName: 'DS1',
              writingSystem: { script: 'Latn', tag: 'es' }
            }
          ],
          trainingSources: Object.entries(state.trainingSourcesBooksChapters).map(([projectId, _booksChapters]) => ({
            paratextId: `${projectId}-pt-id`,
            projectRef: projectId,
            name: `Training Source for ${projectId}`,
            shortName: `TS-${projectId}`,
            writingSystem: { script: 'Latn', tag: 'es' }
          })),
          lastSelectedTrainingScriptureRanges: state.previouslySelectedTrainingScriptureRanges,
          lastSelectedTrainingDataFiles: [],
          lastSelectedTranslationScriptureRanges: state.lastSelectedTranslationScriptureRanges
        }
      }
    });

    const projectId = 'testProjectId';
    when(mockedActivatedProjectService.projectId).thenReturn(projectId);
    when(mockedActivatedProjectService.projectId$).thenReturn(of(projectId));
    when(mockedActivatedProjectService.projectDoc).thenReturn({ data: project } as SFProjectProfileDoc);
    when(mockedActivatedProjectService.projectDoc$).thenReturn(of({ data: project } as SFProjectProfileDoc));
    when(mockedSFProjectService.getProfile(projectId)).thenResolve({ data: project } as SFProjectProfileDoc);

    when(mockedDraftSourcesService.getDraftProjectSources()).thenReturn(
      of({
        trainingSources: state.noAccessSources ? ([{ noAccess: true }] as unknown as DraftSource[]) : [],
        trainingTargets: [],
        draftingSources: []
      })
    );

    // Set up the progress service to return the specified scripture ranges for the project and sources
    when(mockedStubProgressServiceThatGivesChapterLevelInfo.getProgressForProject(projectId)).thenResolve(
      new VerboseScriptureRange(state.targetProjectBooksChapters)
    );
    when(mockedStubProgressServiceThatGivesChapterLevelInfo.getProgressForProject('draft-source-1-id')).thenResolve(
      new VerboseScriptureRange(state.draftingSourceBooksChapters)
    );
    for (const [trainingSourceProjectId, booksChapters] of Object.entries(state.trainingSourcesBooksChapters)) {
      when(
        mockedStubProgressServiceThatGivesChapterLevelInfo.getProgressForProject(trainingSourceProjectId)
      ).thenResolve(new VerboseScriptureRange(booksChapters));
    }

    this.logicHandler = new NewDraftLogicHandler(
      this.activatedProjectService,
      this.draftSourcesService,
      this.stubProgressServiceThatGivesChapterLevelInfo
    );
  }

  async waitForInit(): Promise<void> {
    await firstValueFrom(this.logicHandler.status$.pipe(filter(status => status === 'input')));
  }

  async waitForAbort(): Promise<void> {
    await firstValueFrom(this.logicHandler.status$.pipe(filter(status => status === 'abort')));
  }

  // Aliases

  get availableTrainingSourceBooks(): { [projectId: string]: string[] } {
    return this.logicHandler.availableTrainingSourceBooks$.getValue();
  }

  get selectedTrainingSourceBooks(): { [projectId: string]: string[] } {
    return this.logicHandler.selectedTrainingSourceBooks$.getValue();
  }

  get availableTargetTrainingScriptureRange(): string {
    return this.logicHandler.availableTargetTrainingScriptureRange$.getValue().toString();
  }

  get selectedTargetTrainingScriptureRange(): string {
    return this.logicHandler.selectedTargetTrainingScriptureRange$.getValue().toString();
  }

  get availableDraftingScriptureRange(): string {
    return this.logicHandler.availableDraftingScriptureRange$.getValue().toString();
  }

  get selectedDraftingScriptureRange(): string {
    return this.logicHandler.selectedDraftingScriptureRange$.getValue().toString();
  }

  get booksOfferedForPartialDrafting(): string[] {
    return this.logicHandler.booksOfferedForPartialDrafting$.getValue();
  }

  get booksOfferedForPartialTargetTraining(): string[] {
    return this.logicHandler.booksOfferedForPartialTargetTraining$.getValue();
  }
}
