import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { DraftConfig, DraftingEngine } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { anything, instance, mock, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { I18nService } from 'xforge-common/i18n.service';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { BuildDto } from '../../../machine-api/build-dto';
import { DEFAULT_DRAFTING_ENGINE_AVAILABILITY } from './drafting-engine';
import { DraftingEngineService } from './drafting-engine.service';

describe('DraftingEngineService', () => {
  it('has only the default engine, and so no choice, when no project is active', () => {
    const env = new TestEnvironment(undefined);

    expect(env.service.availability).toEqual(DEFAULT_DRAFTING_ENGINE_AVAILABILITY);
    expect(env.service.selectedEngine).toBe(DraftingEngine.Nmt);
    expect(env.service.hasChoice).toBeFalse();
  });

  it('has the engines made available to the active project and the one selected for it', () => {
    const env = new TestEnvironment({
      availableDraftingEngines: [DraftingEngine.Nmt, DraftingEngine.Llm],
      draftingEngine: DraftingEngine.Llm
    });

    expect(env.service.availability).toEqual({
      availableEngines: [DraftingEngine.Nmt, DraftingEngine.Llm],
      selectedEngine: DraftingEngine.Llm
    });
    expect(env.service.selectedEngine).toBe(DraftingEngine.Llm);
    expect(env.service.selectedEngineText.name).toBe('drafting_engine.name_llm');
    expect(env.service.hasChoice).toBeTrue();
  });

  it('gives the route of the page where the engine is chosen', () => {
    const env = new TestEnvironment({});

    expect(env.service.pagePath).toBe('/projects/project01/draft-generation/translation-engine');
  });

  describe('shouldShow', () => {
    it('is false for the default engine of a project that has no other engine', () => {
      const env = new TestEnvironment({});

      expect(env.service.shouldShow(DraftingEngine.Nmt)).toBeFalse();
    });

    it('is true for an engine that uses an LLM, whatever engines the project has', () => {
      const env = new TestEnvironment({});

      expect(env.service.shouldShow(DraftingEngine.Llm)).toBeTrue();
    });

    it('is true for the default engine of a project that has other engines', () => {
      const env = new TestEnvironment({ availableDraftingEngines: [DraftingEngine.Llm] });

      expect(env.service.shouldShow(DraftingEngine.Nmt)).toBeTrue();
    });
  });

  describe('nameForBuild', () => {
    it('is undefined when neither the build nor the project has anything but the default engine', () => {
      const env = new TestEnvironment({});

      expect(env.service.nameForBuild(TestEnvironment.build('Nmt'))).toBeUndefined();
    });

    it('names the engine when the build used an LLM, even if the project no longer has that engine', () => {
      const env = new TestEnvironment({});

      expect(env.service.nameForBuild(TestEnvironment.build('Llm'))).toBe('translated drafting_engine.name_llm');
    });

    it('names the default engine for a build of a project that has other engines available', () => {
      const env = new TestEnvironment({
        availableDraftingEngines: [DraftingEngine.Nmt, DraftingEngine.NmtWithLlmPostProcessing]
      });

      expect(env.service.nameForBuild(TestEnvironment.build('Nmt'))).toBe('translated drafting_engine.name_nllb');
    });

    it('names a developer engine in English, whatever engines the project has', () => {
      const env = new TestEnvironment({});

      expect(env.service.nameForBuild(TestEnvironment.build('Echo'))).toBe('Echo');
      expect(env.service.nameForBuild(TestEnvironment.build('NmtWithFastTraining'))).toBe('Core (fast)');
    });

    it('is undefined when the server did not report the engine', () => {
      const env = new TestEnvironment({ availableDraftingEngines: [DraftingEngine.Nmt, DraftingEngine.Llm] });

      expect(env.service.nameForBuild(TestEnvironment.build(undefined))).toBeUndefined();
      expect(env.service.nameForBuild(undefined)).toBeUndefined();
    });
  });
});

/** Provides helpers for constructing test data for DraftingEngineService tests. */
class TestEnvironment {
  readonly service: DraftingEngineService;

  /** @param draftConfig The engine settings of the active project, or undefined for no active project. */
  constructor(draftConfig: Partial<DraftConfig> | undefined) {
    const mockedActivatedProjectService = mock(ActivatedProjectService);
    if (draftConfig != null) {
      when(mockedActivatedProjectService.projectId).thenReturn('project01');
      when(mockedActivatedProjectService.projectDoc).thenReturn({
        id: 'project01',
        data: createTestProjectProfile({ translateConfig: { draftConfig: draftConfig } })
      } as SFProjectProfileDoc);
    }
    const mockedI18nService = mock(I18nService);
    when(mockedI18nService.translateStatic(anything())).thenCall((key: string) => `translated ${key}`);
    this.service = new DraftingEngineService(instance(mockedActivatedProjectService), instance(mockedI18nService));
  }

  static build(draftingEngine: string | undefined): BuildDto {
    return { additionalInfo: { translationEngineType: draftingEngine } } as BuildDto;
  }
}
