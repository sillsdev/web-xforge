import { InjectionToken } from '@angular/core';
import { BuildStates } from '../../machine-api/build-states';

/**
 * The build configuration for a pre-translation build.
 */
export interface BuildConfig {
  projectId: string;
  trainingDataFiles: string[];
  trainingScriptureRange?: string;
  trainingScriptureRanges: ProjectScriptureRange[];
  translationScriptureRange?: string;
  translationScriptureRanges: ProjectScriptureRange[];
  fastTraining: boolean;
}

/**
 * A per-project scripture range.
 */
export interface ProjectScriptureRange {
  projectId: string;
  scriptureRange: string;
}

/**
 * Dictionary of 'segmentRef -> segment text'.
 */
export interface DraftSegmentMap {
  [segmentRefId: string]: string | undefined;
}

/**
 * The zipping progress when downloading a draft as a zip file.
 */
export interface DraftZipProgress {
  current: number;
  total: number;
}

/**
 * Configuration options for DraftGenerationService.
 */
export interface DraftGenerationServiceOptions {
  /**
   * Polling frequency in milliseconds.
   */
  pollRate: number;
}

/**
 * Configuration options for DraftGenerationService.
 */
export const DRAFT_GENERATION_SERVICE_OPTIONS = new InjectionToken<DraftGenerationServiceOptions>(
  'DRAFT_GENERATION_SERVICE_OPTIONS',
  {
    providedIn: 'root',
    factory: () => ({
      pollRate: 10_000 // Default to 10 seconds
    })
  }
);

/**
 * Build states for builds that are under way.  A new build should not be started if current build
 * is in one of these states.
 */
export const activeBuildStates: BuildStates[] = [BuildStates.Active, BuildStates.Pending, BuildStates.Queued];

/**
 * Data returned from machine api.
 */
export interface PreTranslationData {
  preTranslations: PreTranslation[];
}

/**
 * Collection item from data returned from machine api.
 */
export interface PreTranslation {
  reference: string;
  translation: string;
}
