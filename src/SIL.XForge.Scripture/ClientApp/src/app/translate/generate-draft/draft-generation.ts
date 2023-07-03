import { InjectionToken } from '@angular/core';
import { BuildStates } from 'src/app/machine-api/build-states';

/**
 * Dictionary of segmentRef -> verse.
 */
export interface DraftSegmentMap {
  [segmentRefId: string]: string;
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
      pollRate: 1000 * 60 * 5 // Default to 5 minutes
    })
  }
);

/**
 * Build states for builds that are under way.  A new build should not be started if current build
 * is in one of these states.
 */
export const ACTIVE_BUILD_STATES = new InjectionToken<BuildStates[]>('ACTIVE_BUILD_STATES', {
  providedIn: 'root',
  factory: () => [BuildStates.Active, BuildStates.Pending, BuildStates.Queued]
});

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
