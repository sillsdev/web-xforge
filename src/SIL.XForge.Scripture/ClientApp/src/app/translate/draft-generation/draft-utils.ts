import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { TranslateSource } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';

export interface DraftSources {
  trainingSources: [TranslateSource?, TranslateSource?];
  trainingTargets: [SFProjectProfile];
  draftingSources: [TranslateSource?];
}

/**
 * Takes a SFProjectProfile and returns the training and drafting sources for the project as three arrays.
 *
 * This considers properties such as alternateTrainingSourceEnabled and alternateTrainingSource and makes sure to only
 * include a source if it's enabled and not null. It also considers whether the project source is implicitly the
 * training and/or drafting source.
 *
 * This method is also intended to be act as an abstraction layer to allow changing the data model in the future without
 * needing to change all the places that use this method.
 *
 * Currently this method provides guarantees via the type system that there will be at most 2 training sources, exactly
 * 1 training target, and at most 1 drafting source. Consumers of this method that cannot accept an arbitrary length for
 * each of these arrays are encouraged to write there code in such a way that it will noticeably break (preferably at
 * build time) if these guarantees are changed, to make it easier to find code that relies on the current limit on the
 * number of sources in each category.
 * @param project The project to get the sources for
 * @returns An object with three arrays: trainingSources, trainingTargets, and draftingSources
 */
export function projectToDraftSources(project: SFProjectProfile): DraftSources {
  const trainingSources: [TranslateSource?, TranslateSource?] = [];
  const draftingSources: [TranslateSource?] = [];

  const trainingTargets: [SFProjectProfile] = [project];

  const draftConfig = project.translateConfig.draftConfig;

  let trainingSource: TranslateSource | undefined;
  if (draftConfig.alternateTrainingSourceEnabled && draftConfig.alternateTrainingSource != null) {
    trainingSource = draftConfig.alternateTrainingSource;
  } else {
    trainingSource = project.translateConfig.source;
  }

  if (trainingSource != null) {
    trainingSources.push(trainingSource);
  }

  if (draftConfig.additionalTrainingSourceEnabled && draftConfig.additionalTrainingSource != null) {
    trainingSources.push(draftConfig.additionalTrainingSource);
  }

  let draftingSource: TranslateSource | undefined;
  if (draftConfig.alternateSourceEnabled && draftConfig.alternateSource != null) {
    draftingSource = draftConfig.alternateSource;
  } else {
    draftingSource = project.translateConfig.source;
  }

  if (draftingSource != null) {
    draftingSources.push(draftingSource);
  }

  return { trainingSources, trainingTargets, draftingSources };
}
