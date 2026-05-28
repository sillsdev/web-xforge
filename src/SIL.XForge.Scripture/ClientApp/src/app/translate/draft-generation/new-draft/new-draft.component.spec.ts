import { Canon } from '@sillsdev/scripture';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { filter, firstValueFrom, of } from 'rxjs';
import { instance, mock, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { I18nService } from 'xforge-common/i18n.service';
import { Router } from '@angular/router';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { DraftSource } from '../draft-source';
import { DraftSourcesService } from '../draft-sources.service';
import { NewDraftComponent } from './new-draft.component';
import { ProgressServiceThatGivesChapterLevelInfo } from './new-draft-logic-handler';
import { VerboseScriptureRange } from './scripture-range';

const SOURCE_SHORT_NAME = 'DS1';
const TARGET_SHORT_NAME = 'TP1';

describe('NewDraftComponent', () => {
  // GEN: source has 50 chapters, target has GEN1-5 → eligible for partial drafting
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

      // Then provide valid input — GEN1-3 is within the available training range GEN1-5
      env.component.onTargetTrainingChaptersBlurred('GEN', '1-3');

      expect(env.component.targetTrainingChapterErrors.has('GEN')).toBeFalse();
      expect(env.selectedTargetTrainingScriptureRange).toBe('GEN1-3');
    });
  });

  describe('onDraftingBookSelect', () => {
    it('removes stale errors for books no longer offered for partial drafting', async () => {
      const env = new TestEnvironment(testState);
      await env.waitForInit();
      env.component.logicHandler.selectDraftingBooks(['GEN']);
      env.component.onDraftingChaptersBlurred('GEN', 'abc');
      expect(env.component.draftingChapterErrors.has('GEN')).toBeTrue();

      // Deselect GEN — switch to MAT only, removing GEN from booksOfferedForPartialDrafting
      env.component.onDraftingBookSelect([Canon.bookIdToNumber('MAT')]);

      expect(env.component.draftingChapterErrors.has('GEN')).toBeFalse();
    });

    it('keeps errors for books still offered for partial drafting', async () => {
      const env = new TestEnvironment(testState);
      await env.waitForInit();
      env.component.logicHandler.selectDraftingBooks(['GEN']);
      env.component.onDraftingChaptersBlurred('GEN', 'abc');

      // Re-select GEN along with another book — GEN remains offered for partial drafting
      env.component.onDraftingBookSelect([Canon.bookIdToNumber('GEN'), Canon.bookIdToNumber('MAT')]);

      expect(env.component.draftingChapterErrors.has('GEN')).toBeTrue();
    });
  });
});

const mockedActivatedProjectService = mock(ActivatedProjectService);
const mockedDraftSourcesService = mock(DraftSourcesService);
const mockedProgressService = mock(ProgressServiceThatGivesChapterLevelInfo);
const mockedI18nService = mock(I18nService);
const mockedRouter = mock(Router);

interface TestState {
  draftingSourceBooksChapters: string;
  targetProjectBooksChapters: string;
  trainingSourcesBooksChapters: { [key: string]: string };
}

class TestEnvironment {
  component: NewDraftComponent;

  constructor(state: TestState) {
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
          lastSelectedTrainingDataFiles: [],
          lastSelectedTranslationScriptureRanges: undefined
        }
      }
    });

    const projectId = 'testProjectId';
    when(mockedActivatedProjectService.projectId).thenReturn(projectId);
    when(mockedActivatedProjectService.projectId$).thenReturn(of(projectId));
    when(mockedActivatedProjectService.projectDoc).thenReturn({ data: project } as SFProjectProfileDoc);
    when(mockedActivatedProjectService.projectDoc$).thenReturn(of({ data: project } as SFProjectProfileDoc));

    when(mockedDraftSourcesService.getDraftProjectSources()).thenReturn(
      of({
        trainingSources: [],
        trainingTargets: [],
        draftingSources: [
          {
            paratextId: 'draft-source-1-pt-id',
            projectRef: 'draft-source-1-id',
            name: 'Draft Source 1',
            shortName: SOURCE_SHORT_NAME,
            writingSystem: { script: 'Latn', tag: 'es' },
            texts: []
          } as DraftSource
        ]
      })
    );

    when(mockedProgressService.getProgressForProject(projectId)).thenResolve(
      new VerboseScriptureRange(state.targetProjectBooksChapters)
    );
    when(mockedProgressService.getProgressForProject('draft-source-1-id')).thenResolve(
      new VerboseScriptureRange(state.draftingSourceBooksChapters)
    );
    for (const [trainingSourceId, booksChapters] of Object.entries(state.trainingSourcesBooksChapters)) {
      when(mockedProgressService.getProgressForProject(trainingSourceId)).thenResolve(
        new VerboseScriptureRange(booksChapters)
      );
    }

    this.component = new NewDraftComponent(
      instance(mockedActivatedProjectService),
      instance(mockedDraftSourcesService),
      instance(mockedProgressService),
      instance(mockedI18nService),
      instance(mockedRouter)
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

  get selectedDraftingScriptureRange(): string {
    return this.component.logicHandler.selectedDraftingScriptureRange$.getValue().toString();
  }

  get selectedTargetTrainingScriptureRange(): string {
    return this.component.logicHandler.selectedTargetTrainingScriptureRange$.getValue().toString();
  }
}
