/**
 * Defines the minimum information needed to list a project (connected or not) for a user to select. This includes
 * enough human identifiable information to allow the user to select the project (name and shortName), as well as
 * Paratext project ID.
 */
export interface SelectableProject {
  name: string;
  shortName: string;
  paratextId: string;
}

/** Like {@link SelectableProject}, but includes the language code. */
export interface SelectableProjectWithLanguageCode extends SelectableProject {
  languageTag: string;
}
