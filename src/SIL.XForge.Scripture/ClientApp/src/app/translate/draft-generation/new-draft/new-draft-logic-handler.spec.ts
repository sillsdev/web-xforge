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
import { NewDraftLogicHandler, StubProgressServiceThatGivesChapterLevelInfo } from './new-draft-logic-handler';
import { VerboseScriptureRange } from './scripture-range';

const FULL_CANON_SCRIPTURE_RANGE = new VerboseScriptureRange(
  Canon.allBookIds
    .filter(book => Canon.isBookOTNT(Canon.bookIdToNumber(book)))
    .map(book => `${book}1-${chapterCounts[book]}`)
    .join(';')
).toString();

fdescribe('NewDraftLogicHandler', () => {
  const teamStartingToTranslateGenesis = {
    lastSelectedTranslationScriptureRanges: [{ projectId: 'draft-source-1-project-id', scriptureRange: 'GEN' }],
    previouslySelectedTrainingScriptureRanges: [
      { projectId: 'training-source-1-project-id', scriptureRange: 'MAT;MRK;LUK;JHN' }
    ],
    draftingSourceBooksChapters: FULL_CANON_SCRIPTURE_RANGE,
    targetProjectBooksChapters: 'GEN1-5;MAT1-28;MRK1-16;LUK1-24;JHN1-21',
    trainingSourcesBooksChapters: {
      'training-source-1-project-id': FULL_CANON_SCRIPTURE_RANGE
    }
  } as const satisfies TestState;

  it('initializes available ranges based on progress service', async () => {
    const testState = teamStartingToTranslateGenesis;
    const env = new TestEnvironment(testState);
    const handler = env.logicHandler;
    await env.waitForInit();

    // Ranges availble for selection should be set automatically upon init
    expect(handler.availableDraftingScriptureRange$.value?.toString()).toBe(testState.draftingSourceBooksChapters);
    expect(handler.availableTargetTrainingScriptureRange$.value?.toString()).toBe(testState.targetProjectBooksChapters);

    // Selections should be blank
    expect(handler.selectedDraftingScriptureRange$.value?.toString()).toBe('');
    expect(handler.selectedTargetTrainingScriptureRange$.value?.toString()).toBe('');
  });

  it('allows selecting books and chapters within the available ranges', async () => {
    const testState = teamStartingToTranslateGenesis;
    const env = new TestEnvironment(testState);
    const handler = env.logicHandler;
    await env.waitForInit();

    // Select Genesis for drafting
    handler.selectDraftingBooks(['GEN']);
    expect(handler.selectedDraftingScriptureRange$.value?.toString()).toBe('GEN1-50');
  });

  it('defaults to previous training data when going to the training step', async () => {
    const testState = teamStartingToTranslateGenesis;
    const env = new TestEnvironment(testState);
    const handler = env.logicHandler;
    await env.waitForInit();

    // Initially no training books selected
    expect(handler.selectedTargetTrainingScriptureRange$.value?.toString()).toBe('');
    expect(handler.selectedTrainingSourceBooks$.value).toEqual({});

    handler.setInputMode('training_books');

    // Previous training selections should be selected by default when going to the training step
    expect(handler.selectedTargetTrainingScriptureRange$.value?.toString()).toBe('MAT1-28;MRK1-16;LUK1-24;JHN1-21');
    expect(Object.keys(handler.selectedTrainingSourceBooks$.value).length).toEqual(1);
    expect(handler.selectedTrainingSourceBooks$.value['training-source-1-project-id']).toEqual([
      'MAT',
      'MRK',
      'LUK',
      'JHN'
    ]);
  });

  it('does not automatically select training data that was previously selected but is no longer available in the training sources', async () => {
    const testState = {
      ...teamStartingToTranslateGenesis,
      trainingSourcesBooksChapters: {
        'training-source-1-project-id': FULL_CANON_SCRIPTURE_RANGE.replace('MAT1-28', '')
      }
    };
    expect(testState.trainingSourcesBooksChapters['training-source-1-project-id']).not.toContain('MAT1-28');
    const env = new TestEnvironment(testState);
    const handler = env.logicHandler;
    await env.waitForInit();

    handler.setInputMode('training_books');

    // The previously selected training data included MAT, but since that's now unavailable, it should not be selected
    expect(Object.keys(handler.availableTrainingSourceBooks$.value!).length).toBe(1);
    expect(handler.availableTrainingSourceBooks$.value!['training-source-1-project-id']).toEqual([
      'GEN',
      'MRK',
      'LUK',
      'JHN'
    ]);
    expect(handler.selectedTargetTrainingScriptureRange$.value?.toString()).toBe('MRK1-16;LUK1-24;JHN1-21');
    expect(Object.keys(handler.selectedTrainingSourceBooks$.value).length).toEqual(1);
    expect(handler.selectedTrainingSourceBooks$.value['training-source-1-project-id']).toEqual(['MRK', 'LUK', 'JHN']);
    expect(handler.selectedTargetTrainingScriptureRange$.value?.toString()).toBe('MRK1-16;LUK1-24;JHN1-21');
  });

  it('does not automatically select training data that was previously selected but is now selected to be drafted', async () => {
    const testState = teamStartingToTranslateGenesis;
    const env = new TestEnvironment(testState);
    const handler = env.logicHandler;
    await env.waitForInit();

    handler.selectDraftingBooks(['MAT']);

    handler.setInputMode('training_books');

    // The previously selected training data includes MAT, but since that's now selected as drafting material, it should
    // not be selected as training material
    expect(handler.availableTargetTrainingScriptureRange$.value?.toString()).toBe('GEN1-5;MRK1-16;LUK1-24;JHN1-21');
    expect(handler.selectedTargetTrainingScriptureRange$.value?.toString()).toBe('MRK1-16;LUK1-24;JHN1-21');
    expect(Object.keys(handler.selectedTrainingSourceBooks$.value).length).toEqual(1);
    expect(handler.selectedTrainingSourceBooks$.value['training-source-1-project-id']).toEqual(['MRK', 'LUK', 'JHN']);
  });
});

const mockedActivatedProjectService = mock(ActivatedProjectService);
const mockedSFProjectService = mock(SFProjectService);
const mockedDraftSourcesService = mock(DraftSourcesService);
const mockedStubProgressServiceThatGivesChapterLevelInfo = mock(StubProgressServiceThatGivesChapterLevelInfo);

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
              projectRef: 'draft-source-1-project-id',
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
    when(
      mockedStubProgressServiceThatGivesChapterLevelInfo.getProgressForProject('draft-source-1-project-id')
    ).thenResolve(new VerboseScriptureRange(state.draftingSourceBooksChapters));
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
}
