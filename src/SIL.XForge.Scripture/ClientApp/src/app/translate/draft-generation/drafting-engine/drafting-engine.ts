import { DraftConfig, DraftingEngine } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { I18nKey } from 'xforge-common/i18n.service';
import { BuildDto } from '../../../machine-api/build-dto';

/**
 * The engines a Serval admin can make available to a project, and that the project's team can then choose between.
 * The other engines (Echo and NMT with fast training) are developer options chosen per draft.
 */
export type SelectableDraftingEngine =
  DraftingEngine.Nmt | DraftingEngine.NmtWithLlmPostProcessing | DraftingEngine.Llm;

/** The selectable engines, in the order they are shown. */
export const SELECTABLE_DRAFTING_ENGINES: readonly SelectableDraftingEngine[] = [
  DraftingEngine.Nmt,
  DraftingEngine.NmtWithLlmPostProcessing,
  DraftingEngine.Llm
];

/** The engine that is available to every project, and that a project uses until another engine is selected. */
export const DEFAULT_DRAFTING_ENGINE: SelectableDraftingEngine = DraftingEngine.Nmt;

/** How long users are told that generating a draft takes. It is the `count` given to an engine's `duration` message. */
export const DRAFT_DURATION_HOURS: number = 1.5;

/** Localization keys describing an engine to end users. */
export interface DraftingEngineText {
  name: I18nKey;
  description: I18nKey;
  /** A message telling the user how long generating a draft takes. It accepts a `count` of hours, though may not use it. */
  duration: I18nKey;
}

/** What the app knows about a drafting engine. */
export interface DraftingEngineInfo {
  /** Whether the engine sends project data to a third-party LLM provider. */
  usesLlm: boolean;
  /** Whether the engine can draft more than one book in a single draft. */
  supportsMultipleBooks: boolean;
  /**
   * The engine's name in English, shortened where it can be. It is shown where engine names are not localized: in
   * Serval admin tables, and wherever a developer engine is named, as only developers and testers make drafts with
   * those.
   */
  shortEnglishName: string;
}

/** What the app also knows about an engine that a project's team can choose. */
export interface SelectableDraftingEngineInfo extends DraftingEngineInfo {
  /** How the engine is described to end users. */
  text: DraftingEngineText;
}

export const SELECTABLE_DRAFTING_ENGINE_INFO: Record<SelectableDraftingEngine, SelectableDraftingEngineInfo> = {
  [DraftingEngine.Nmt]: {
    usesLlm: false,
    supportsMultipleBooks: true,
    shortEnglishName: 'Core',
    text: {
      name: 'drafting_engine.name_nllb',
      description: 'drafting_engine.description_nllb',
      duration: 'draft_generation.instructions_draft_process'
    }
  },
  [DraftingEngine.NmtWithLlmPostProcessing]: {
    usesLlm: true,
    supportsMultipleBooks: false,
    shortEnglishName: 'Core with Refinements',
    text: {
      name: 'drafting_engine.name_nllb_llm',
      description: 'drafting_engine.description_nllb_llm',
      duration: 'drafting_engine.duration_nllb_llm'
    }
  },
  [DraftingEngine.Llm]: {
    usesLlm: true,
    supportsMultipleBooks: false,
    shortEnglishName: 'Frontier',
    text: {
      name: 'drafting_engine.name_llm',
      description: 'drafting_engine.description_llm',
      duration: 'drafting_engine.duration_llm'
    }
  }
};

export const DRAFTING_ENGINE_INFO: Record<DraftingEngine, DraftingEngineInfo> = {
  ...SELECTABLE_DRAFTING_ENGINE_INFO,
  [DraftingEngine.NmtWithFastTraining]: {
    usesLlm: false,
    supportsMultipleBooks: true,
    shortEnglishName: 'Core (fast)'
  },
  [DraftingEngine.Echo]: { usesLlm: false, supportsMultipleBooks: true, shortEnglishName: 'Echo' }
};

export function isSelectableDraftingEngine(engine: DraftingEngine): engine is SelectableDraftingEngine {
  return SELECTABLE_DRAFTING_ENGINES.some(selectable => selectable === engine);
}

/** Which drafting engines a project may use, and which of them its drafts are generated with. */
export interface DraftingEngineAvailability {
  /** In the order of SELECTABLE_DRAFTING_ENGINES. Always includes the default engine. */
  availableEngines: SelectableDraftingEngine[];
  /** One of the available engines. The project's team can change it when several are available. */
  selectedEngine: SelectableDraftingEngine;
}

/** What a project has when no Serval admin has changed its engines. */
export const DEFAULT_DRAFTING_ENGINE_AVAILABILITY: DraftingEngineAvailability = {
  availableEngines: [DEFAULT_DRAFTING_ENGINE],
  selectedEngine: DEFAULT_DRAFTING_ENGINE
};

/**
 * The engines a project has, given the engines that were made available to it and the engine that was selected for
 * it. Every project has the default engine, whether or not it is listed, and a project whose selected engine is
 * missing or not available uses the default engine.
 */
export function resolveDraftingEngines(
  available: readonly DraftingEngine[] | undefined,
  selected: DraftingEngine | undefined
): DraftingEngineAvailability {
  const availableEngines: SelectableDraftingEngine[] = SELECTABLE_DRAFTING_ENGINES.filter(
    engine => engine === DEFAULT_DRAFTING_ENGINE || (available?.includes(engine) ?? false)
  );
  const selectedEngine: SelectableDraftingEngine =
    availableEngines.find(engine => engine === selected) ?? DEFAULT_DRAFTING_ENGINE;
  return { availableEngines: availableEngines, selectedEngine: selectedEngine };
}

/** The engines the project's team can choose between, and the one the project's drafts are generated with. */
export function draftingEngineAvailabilityOf(draftConfig: DraftConfig | undefined): DraftingEngineAvailability {
  return resolveDraftingEngines(draftConfig?.availableDraftingEngines, draftConfig?.draftingEngine);
}

/**
 * The engine the build's draft was generated with, if the server could tell. The server reports it in
 * `translationEngineType`, as the name of a DraftingEngine rather than as Serval's own engine type.
 */
export function buildDraftingEngine(build: BuildDto | undefined): DraftingEngine | undefined {
  const reported: string | undefined = build?.additionalInfo?.translationEngineType;
  return Object.values(DraftingEngine).find(engine => engine === reported);
}
