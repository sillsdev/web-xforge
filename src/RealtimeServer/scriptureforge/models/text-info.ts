export interface Chapter {
  number: number;
  lastVerse: number;
}

/** Documents in the texts collection in the database represent the metadata
 * for a Scripture book. They are not necessarily for a book in a specific
 * paratext project (eg mother or daughter), but represent metadata for a
 * book in a given SF site project. */
export interface TextInfo {
  bookNum: number;
  hasSource: boolean;
  chapters: Chapter[];
}
