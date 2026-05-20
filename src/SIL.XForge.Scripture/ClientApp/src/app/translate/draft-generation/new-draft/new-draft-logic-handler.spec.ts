import { Canon } from '@sillsdev/scripture';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { ProjectScriptureRange } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { filter, firstValueFrom, of } from 'rxjs';
import { instance, mock, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { SFProjectService } from '../../../core/sf-project.service';
import { chapterCounts } from '../../../shared/progress-service/progress.service';
import { DraftSourcesService } from '../draft-sources.service';
import { NewDraftLogicHandler, ProgressServiceThatGivesChapterLevelInfo } from './new-draft-logic-handler';
import { VerboseScriptureRange } from './scripture-range';

const FULL_CANON_SCRIPTURE_RANGE = new VerboseScriptureRange(
  Canon.allBookIds
    .filter(book => Canon.isBookOTNT(Canon.bookIdToNumber(book)))
    .map(book => `${book}1-${chapterCounts[book]}`)
    .join(';')
).toString();

fdescribe('NewDraftLogicHandler', () => {
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

  it('allows selecting books and chapters within the available ranges', async () => {
    const testState = teamStartingToTranslateGenesis;
    const env = new TestEnvironment(testState);
    await env.waitForInit();

    // Select Genesis for drafting
    env.logicHandler.selectDraftingBooks(['GEN']);
    // Remaining undrafted chapters automatically selected
    expect(env.selectedDraftingScriptureRange).toBe('GEN6-50');
  });

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
        'training-source-1-id': FULL_CANON_SCRIPTURE_RANGE.replace('MAT1-28', '')
      }
    };
    expect(testState.trainingSourcesBooksChapters['training-source-1-id']).not.toContain('MAT1-28');
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
      targetProjectBooksChapters: teamStartingToTranslateGenesis.targetProjectBooksChapters.replace('GEN1-5', 'GEN1-50')
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

    env.logicHandler.selectDraftingBooks(['GEN', 'EXO']);

    // User should be able to select both GEN and EXO for drafting, but only GEN should be offered for partial drafting since EXO has no progress
    expect(env.booksOfferedForPartialDrafting).toEqual(['GEN']);
    expect(env.selectedDraftingScriptureRange).toBe('GEN6-50;EXO1-40');
  });

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
    env.logicHandler.trySelectDraftingChapters('GEN', '7,20-50');
    expect(env.selectedDraftingScriptureRange).toBe('GEN7,20-50');
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
    expect(env.availableTargetTrainingScriptureRange).toBe('GEN1-5;MRK1-16;LUK1-24;JHN1-21');
    expect(env.selectedTargetTrainingScriptureRange).toBe('MRK1-16;LUK1-24;JHN1-21');
    expect(env.selectedTrainingSourceBooks).toEqual({ 'training-source-1-id': ['MRK', 'LUK', 'JHN'] });
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
    when(mockedActivatedProjectService.projectDoc).thenReturn({ data: project } as SFProjectProfileDoc);
    when(mockedSFProjectService.getProfile(projectId)).thenResolve({ data: project } as SFProjectProfileDoc);

    when(mockedDraftSourcesService.getDraftProjectSources()).thenReturn(
      of({ trainingSources: [], trainingTargets: [], draftingSources: [] })
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
}
