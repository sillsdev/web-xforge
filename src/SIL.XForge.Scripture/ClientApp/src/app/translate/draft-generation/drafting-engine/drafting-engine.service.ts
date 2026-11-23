import { Injectable } from '@angular/core';
import { DraftingEngine } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { I18nService } from 'xforge-common/i18n.service';
import { BuildDto } from '../../../machine-api/build-dto';
import {
  buildDraftingEngine,
  DRAFTING_ENGINE_INFO,
  DraftingEngineAvailability,
  draftingEngineAvailabilityOf,
  DraftingEngineText,
  isSelectableDraftingEngine,
  SELECTABLE_DRAFTING_ENGINE_INFO,
  SelectableDraftingEngine
} from './drafting-engine';

/** The drafting engines of the project the user is working in. */
@Injectable({ providedIn: 'root' })
export class DraftingEngineService {
  constructor(
    private readonly activatedProject: ActivatedProjectService,
    private readonly i18n: I18nService
  ) {}

  /** The engines the project's team can choose between, and the one the project's drafts are generated with. */
  get availability(): DraftingEngineAvailability {
    return draftingEngineAvailabilityOf(this.activatedProject.projectDoc?.data?.translateConfig.draftConfig);
  }

  /** The engine the project's drafts are generated with. */
  get selectedEngine(): SelectableDraftingEngine {
    return this.availability.selectedEngine;
  }

  /** How the project's selected engine is described to the project's users. */
  get selectedEngineText(): DraftingEngineText {
    return SELECTABLE_DRAFTING_ENGINE_INFO[this.selectedEngine].text;
  }

  /** Whether the project has more than one engine for its team to choose between. */
  get hasChoice(): boolean {
    return this.availability.availableEngines.length > 1;
  }

  /**
   * The route of the page where the project's team chooses its engine. It is a string, rather than an array of route
   * commands, so that a template can bind to it without the value changing identity on every change detection.
   */
  get pagePath(): string {
    return `/projects/${this.activatedProject.projectId ?? ''}/draft-generation/translation-engine`;
  }

  /**
   * Whether users of the project should be told that a draft is, or was, generated with the given engine. A project
   * that has only ever had the default engine has nothing to distinguish, so its users are not told about engines.
   */
  shouldShow(engine: DraftingEngine): boolean {
    return DRAFTING_ENGINE_INFO[engine].usesLlm || this.hasChoice;
  }

  /**
   * The name of the engine a build's draft was generated with, or undefined if the server did not report the engine
   * or users should not be told (see shouldShow). A developer engine is always named, in English, so that developers
   * and testers can see that a draft was made with one. End users cannot make drafts with those engines.
   */
  nameForBuild(build: BuildDto | undefined): string | undefined {
    const engine: DraftingEngine | undefined = buildDraftingEngine(build);
    if (engine == null) return undefined;
    if (!isSelectableDraftingEngine(engine)) return DRAFTING_ENGINE_INFO[engine].shortEnglishName;
    if (!this.shouldShow(engine)) return undefined;
    return this.i18n.translateStatic(SELECTABLE_DRAFTING_ENGINE_INFO[engine].text.name);
  }
}
