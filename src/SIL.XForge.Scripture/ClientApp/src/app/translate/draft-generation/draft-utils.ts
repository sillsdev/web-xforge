import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { TranslateSource } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import language_code_mapping from '../../../../../language_code_mapping.json';
import { SelectableProjectWithLanguageCode } from '../../core/paratext.service';

/** Represents draft sources as a set of two {@link TranslateSource} arrays, and one {@link SFProjectProfile} array. */
export interface DraftSourcesAsTranslateSourceArrays {
  trainingSources: TranslateSource[];
  trainingTargets: SFProjectProfile[];
  draftingSources: TranslateSource[];
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
 * This method is also intended to be act as an abstraction layer to allow changing the data model in the future to
 * allow multiple training targets without needing to change all the places that use this method.
 *
 * @param project The project to get the sources for
 * @returns An object with three arrays: trainingSources, trainingTargets, and draftingSources
 */
export function projectToDraftSources(project: SFProjectProfile): DraftSourcesAsTranslateSourceArrays {
  const trainingSources: TranslateSource[] = [...project.translateConfig.draftConfig.trainingSources];
  const draftingSources: TranslateSource[] = [...project.translateConfig.draftConfig.draftingSources];
  const trainingTargets: SFProjectProfile[] = [project];
  return { trainingSources, trainingTargets, draftingSources };
}

/**
 * Maps ISO 639-1 two letter codes, and ISO 639-2 bibliographic codes to the corresponding ISO 639-3 language code,
 * All region and script information is stripped and ignored.
 */
export function normalizeLanguageCodeToISO639_3(code: string): string {
  code = code.split('-')[0];
  if (code in language_code_mapping.iso639_1_to_iso639_3) code = language_code_mapping.iso639_1_to_iso639_3[code];
  if (code in language_code_mapping.bibliographicToTerminology) {
    code = language_code_mapping.bibliographicToTerminology[code];
  }
  return code;
}
