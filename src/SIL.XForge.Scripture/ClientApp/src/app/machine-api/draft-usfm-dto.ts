/**
 * The draft USFM for the books drafted by a build.
 */
export interface DraftUsfmDto {
  /** The Serval build identifier. */
  buildId: string;
  /** The books drafted by the build, in canonical order. */
  books: DraftUsfmBook[];
}

/**
 * The draft USFM for one book drafted by a build.
 */
export interface DraftUsfmBook {
  /** The USFM book identifier, e.g. GEN. */
  bookId: string;
  /** The chapters included in the USFM. */
  chapters: number[];
  /** The complete USFM book text, starting with an \id line. */
  usfm: string;
}
