import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { TranslateSource } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { SelectableProjectWithLanguageCode } from '../../core/paratext.service';

export function englishNameFromCode(code: string): string {
  const locale = new Intl.Locale(code);
  return new Intl.DisplayNames(['en'], { type: 'language' }).of(locale.language) ?? '';
}

export function areLanguageCodesEquivalent(code1: string, code2: string): boolean {
  return code1 === code2 || englishNameFromCode(code1) === englishNameFromCode(code2);
}

/**
 * Given a list of language codes, counts the number of codes that are "unique" in the sense that they have different
 * English names.
 *
 * This is a *very rough* way of determining whether languages are "equivalent" for the purposes of training a model.
 *
 * As an example, zh and cmn both map to "Chinese" in English, so they would be considered equivalent.
 *
 * TODO Create a more robust way of determining whether languages are equivalent, that isn't browser-dependent.
 */
export function countNonEquivalentLanguageCodes(languageCodes: string[]): number {
  const uniqueTags = new Set(languageCodes);
  return new Set(Array.from(uniqueTags).map(englishNameFromCode)).size;
}

/** Represents draft sources as a set of two {@link TranslateSource} arrays, and one {@link SFProjectProfile} array. */
export interface DraftSourcesAsTranslateSourceArrays {
  trainingSources: TranslateSource[] & ({ length: 0 } | { length: 1 } | { length: 2 });
  trainingTargets: [SFProjectProfile];
  draftingSources: TranslateSource[] & ({ length: 0 } | { length: 1 });
}

/** Represents draft sources as a set of three {@link SelectableProjectWithLanguageCode} arrays. */
export interface DraftSourcesAsSelectableProjectArrays {
  trainingSources: SelectableProjectWithLanguageCode[];
  trainingTargets: SelectableProjectWithLanguageCode[];
  draftingSources: SelectableProjectWithLanguageCode[];
}

/**
 * Maps from a {@link TranslateSource} to a {@link SelectableProjectWithLanguageCode}. While the two types are used in
 * similar contexts, a SelectableProjectWithLanguageCode may represent a project or resource that has not yet been
 * connected, and therefore does not have some of the properties of a TranslateSource. For example, there's no
 * projectRef on a SelectableProjectWithLanguageCode because it may not be a connected project.
 *
 * Alternatively, this can take an entire {@link SFProjectProfile} as an input, which contains a superset of what a
 * TranslateSource contains.
 */
export function translateSourceToSelectableProjectWithLanguageTag(
  project: TranslateSource | SFProjectProfile
): SelectableProjectWithLanguageCode {
  return {
    paratextId: project.paratextId,
    name: project.name,
    shortName: project.shortName,
    languageTag: project.writingSystem.tag
  };
}

export function draftSourcesAsTranslateSourceArraysToDraftSourcesAsSelectableProjectArrays(
  sources: DraftSourcesAsTranslateSourceArrays
): DraftSourcesAsSelectableProjectArrays {
  return {
    draftingSources: sources.draftingSources.map(translateSourceToSelectableProjectWithLanguageTag),
    trainingSources: sources.trainingSources.map(translateSourceToSelectableProjectWithLanguageTag),
    trainingTargets: sources.trainingTargets.map(translateSourceToSelectableProjectWithLanguageTag)
  };
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
 * each of these arrays are encouraged to write their code in such a way that it will noticeably break (preferably at
 * build time) if these guarantees are changed, to make it easier to find code that relies on the current limit on the
 * number of sources in each category.
 * @param project The project to get the sources for
 * @returns An object with three arrays: trainingSources, trainingTargets, and draftingSources
 */
export function projectToDraftSources(project: SFProjectProfile): DraftSourcesAsTranslateSourceArrays {
  const trainingSources: TranslateSource[] & ({ length: 0 } | { length: 1 } | { length: 2 }) = [];
  const draftingSources: TranslateSource[] & ({ length: 0 } | { length: 1 }) = [];
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
