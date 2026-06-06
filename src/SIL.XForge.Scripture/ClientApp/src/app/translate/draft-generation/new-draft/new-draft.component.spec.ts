import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Canon } from '@sillsdev/scripture';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { filter, firstValueFrom, of } from 'rxjs';
import { anything, deepEqual, instance, mock, reset, verify, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { ErrorReportingService } from 'xforge-common/error-reporting.service';
import { createTestFeatureFlag, FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { I18nService } from 'xforge-common/i18n.service';
import { provideTestOnlineStatus } from 'xforge-common/test-online-status-providers';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { ParatextService } from '../../../core/paratext.service';
import { NllbLanguageService } from '../../nllb-language.service';
import { DraftGenerationService } from '../draft-generation.service';
import { DraftSource } from '../draft-source';
import { DraftSourcesService } from '../draft-sources.service';
import { DraftProgressService } from './new-draft-logic-handler';
import { NewDraftComponent } from './new-draft.component';
import { VerboseScriptureRange } from './scripture-range';

const SOURCE_SHORT_NAME = 'DS1';
const TARGET_SHORT_NAME = 'TP1';

describe('NewDraftComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [TestOnlineStatusService, provideTestOnlineStatus()] });
  });

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

    it('does not show a book in the source when it is not in the training source', async () => {
      const stateWithoutGEN = {
        ...testState,
        trainingSourcesBooksChapters: { 'training-source-1-id': 'MAT1-28;MRK1-16;LUK1-24;JHN1-21' }
      };
      const env = new TestEnvironment(stateWithoutGEN);
      await env.waitForInit();
      env.component.logicHandler.setInputMode('training_books');

      // GEN is in the target project but not in the training source
      env.component.onTargetTrainingBookSelect([Canon.bookIdToNumber('GEN')]);

      expect(env.availableTrainingSourceBookIds('training-source-1-id')).not.toContain('GEN');
      expect(env.availableTrainingSourceBookIds('training-source-1-id')).toEqual([]);
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
      // Select MAT and MRK — both auto-selected in source
      env.component.onTargetTrainingBookSelect([Canon.bookIdToNumber('MAT'), Canon.bookIdToNumber('MRK')]);
      // User manually deselects MRK from the source
      env.component.onTrainingSourceBookSelect([Canon.bookIdToNumber('MAT')], 'training-source-1-id');

      // Add LUK to target — LUK should be auto-selected, MRK should stay deselected
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
      // GEN: source has chapters 1-50, target has 1-5 → default draft selection is 6-50
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
  });

  describe('detectPendingUpdates', () => {
    it('proceeds to the preface page when getProjects fails', fakeAsync(() => {
      const env = new TestEnvironment(testState, { getProjectsError: true });
      tick();

      expect(env.component.page).toEqual('preface');
      verify(mockedErrorReportingService.silentError(anything(), anything())).once();
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

interface TestState {
  draftingSourceBooksChapters: string;
  targetProjectBooksChapters: string;
  trainingSourcesBooksChapters: { [key: string]: string };
  draftingSourceCopyrightBanner?: string;
  trainingSourceCopyrightBanners?: { [key: string]: string };
}

class TestEnvironment {
  component: NewDraftComponent;
  readonly onlineStatusService = TestBed.inject(TestOnlineStatusService);

  constructor(state: TestState, options: { getProjectsError?: boolean } = {}) {
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

    when(mockedFeatureFlagService.showDeveloperTools).thenReturn(createTestFeatureFlag(false));
    when(mockedUserService.getCurrentUser()).thenResolve(undefined as any);
    when(mockedNllbLanguageService.isNllbLanguageAsync(anything())).thenResolve(false);
    if (options.getProjectsError) {
      when(mockedParatextService.getProjects()).thenReject(new Error('network error'));
    } else {
      when(mockedParatextService.getProjects()).thenResolve(undefined);
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
      instance(mockedErrorReportingService)
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
