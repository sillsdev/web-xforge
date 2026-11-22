import { DraftConfig, DraftingEngine } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { BuildDto } from '../../../machine-api/build-dto';
import {
  buildDraftingEngine,
  DEFAULT_DRAFTING_ENGINE_AVAILABILITY,
  DRAFTING_ENGINE_INFO,
  draftingEngineAvailabilityOf,
  resolveDraftingEngines
} from './drafting-engine';

describe('drafting engine', () => {
  describe('resolveDraftingEngines', () => {
    it('is the default engine alone when nothing has been made available or selected', () => {
      expect(resolveDraftingEngines(undefined, undefined)).toEqual(DEFAULT_DRAFTING_ENGINE_AVAILABILITY);
      expect(resolveDraftingEngines([], undefined)).toEqual(DEFAULT_DRAFTING_ENGINE_AVAILABILITY);
    });

    it('lists the engines made available in a fixed order', () => {
      expect(
        resolveDraftingEngines(
          [DraftingEngine.Llm, DraftingEngine.Nmt, DraftingEngine.NmtWithLlmPostProcessing],
          undefined
        ).availableEngines
      ).toEqual([DraftingEngine.Nmt, DraftingEngine.NmtWithLlmPostProcessing, DraftingEngine.Llm]);
    });

    it('always includes the default engine', () => {
      expect(resolveDraftingEngines([DraftingEngine.Llm], undefined).availableEngines).toEqual([
        DraftingEngine.Nmt,
        DraftingEngine.Llm
      ]);
    });

    it('leaves out the developer engines, which are not chosen per project', () => {
      expect(
        resolveDraftingEngines(
          [DraftingEngine.Echo, DraftingEngine.NmtWithFastTraining, DraftingEngine.Llm],
          DraftingEngine.Echo
        )
      ).toEqual({ availableEngines: [DraftingEngine.Nmt, DraftingEngine.Llm], selectedEngine: DraftingEngine.Nmt });
    });

    it('selects the default engine when none has been selected', () => {
      expect(resolveDraftingEngines([DraftingEngine.Llm], undefined).selectedEngine).toBe(DraftingEngine.Nmt);
    });

    it('selects the engine that was selected when it is available', () => {
      expect(resolveDraftingEngines([DraftingEngine.Nmt, DraftingEngine.Llm], DraftingEngine.Llm).selectedEngine).toBe(
        DraftingEngine.Llm
      );
    });

    it('selects the default engine when the engine that was selected is no longer available', () => {
      expect(
        resolveDraftingEngines([DraftingEngine.Nmt, DraftingEngine.NmtWithLlmPostProcessing], DraftingEngine.Llm)
          .selectedEngine
      ).toBe(DraftingEngine.Nmt);
    });
  });

  describe('draftingEngineAvailabilityOf', () => {
    it('is the default engine alone for a project with no draft configuration', () => {
      expect(draftingEngineAvailabilityOf(undefined)).toEqual(DEFAULT_DRAFTING_ENGINE_AVAILABILITY);
    });

    it('is the engines made available to the project and the one selected', () => {
      const draftConfig: DraftConfig = {
        draftingSources: [],
        trainingSources: [],
        lastSelectedTrainingDataFiles: [],
        availableDraftingEngines: [DraftingEngine.Nmt, DraftingEngine.Llm],
        draftingEngine: DraftingEngine.Llm
      };

      expect(draftingEngineAvailabilityOf(draftConfig)).toEqual({
        availableEngines: [DraftingEngine.Nmt, DraftingEngine.Llm],
        selectedEngine: DraftingEngine.Llm
      });
    });
  });

  it('knows which engines use an LLM, and that those draft one book at a time', () => {
    for (const engine of [DraftingEngine.Nmt, DraftingEngine.NmtWithFastTraining, DraftingEngine.Echo]) {
      expect(DRAFTING_ENGINE_INFO[engine].usesLlm).withContext(engine).toBeFalse();
      expect(DRAFTING_ENGINE_INFO[engine].supportsMultipleBooks).withContext(engine).toBeTrue();
    }
    for (const engine of [DraftingEngine.NmtWithLlmPostProcessing, DraftingEngine.Llm]) {
      expect(DRAFTING_ENGINE_INFO[engine].usesLlm).withContext(engine).toBeTrue();
      expect(DRAFTING_ENGINE_INFO[engine].supportsMultipleBooks).withContext(engine).toBeFalse();
    }
  });

  describe('buildDraftingEngine', () => {
    it('is the engine the server reported for the build', () => {
      expect(buildDraftingEngine(TestEnvironment.build('Llm'))).toBe(DraftingEngine.Llm);
    });

    it('is undefined when the server could not tell the engine, or reported one this client does not know', () => {
      expect(buildDraftingEngine(undefined)).toBeUndefined();
      expect(buildDraftingEngine(TestEnvironment.build(undefined))).toBeUndefined();
      expect(buildDraftingEngine(TestEnvironment.build('SomeFutureEngine'))).toBeUndefined();
    });
  });
});

/** Provides helpers for constructing test data for drafting engine tests. */
class TestEnvironment {
  static build(draftingEngine: string | undefined): BuildDto {
    return { additionalInfo: { translationEngineType: draftingEngine } } as BuildDto;
  }
}
