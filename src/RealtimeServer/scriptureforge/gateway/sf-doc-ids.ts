import { Canon } from '@sillsdev/scripture';

/**
 * Parsers for the doc ids of Scripture Forge's collections. The gateway decides access to a doc that does not exist
 * from its id alone, so these accept only ids of the forms the backend and the client build, and nothing that could
 * be read more than one way.
 */

/** The longest id part accepted. Real ids are 24 characters (ObjectIds) or 40 (Paratext ids). */
const MAX_ID_PART_LENGTH = 64;

/** Project and user ids: lowercase hex, as the validation schemas require. */
const HEX_ID_PATTERN = /^[0-9a-f]+$/;

/**
 * The data id part of an existing doc's id. The client and the backend make data ids as ObjectIds, but the gateway
 * does not refuse other simple ids, so that a doc made some other way in the past stays readable.
 */
const DATA_ID_PATTERN = /^[0-9A-Za-z_-]+$/;

/** Whether a string is a project or user id. */
export function isHexId(id: string): boolean {
  return id.length <= MAX_ID_PART_LENGTH && HEX_ID_PATTERN.test(id);
}

/** Whether a string is the data id part of a project data doc's id (see DATA_ID_PATTERN). */
export function isDataId(id: string): boolean {
  return id.length <= MAX_ID_PART_LENGTH && DATA_ID_PATTERN.test(id);
}

/** The parts of `${projectId}:${dataId}`, the id of questions, note threads, biblical terms and training data. */
export interface ProjectDataId {
  readonly projectId: string;
  readonly dataId: string;
}

export function parseProjectDataId(docId: string): ProjectDataId | undefined {
  const parts: string[] = docId.split(':');
  if (parts.length !== 2 || !isHexId(parts[0]) || !isDataId(parts[1])) {
    return undefined;
  }
  return { projectId: parts[0], dataId: parts[1] };
}

/** The parts of `${projectId}:${userId}`, the id of a project user config. */
export interface ProjectUserConfigId {
  readonly projectId: string;
  readonly userId: string;
}

export function parseProjectUserConfigId(docId: string): ProjectUserConfigId | undefined {
  const parts: string[] = docId.split(':');
  if (parts.length !== 2 || !isHexId(parts[0]) || !isHexId(parts[1])) {
    return undefined;
  }
  return { projectId: parts[0], userId: parts[1] };
}

/** The parts of `${projectId}:${BOOK}:${chapter}:target`, the id of a text or a chapter's audio. */
export interface ChapterDocId {
  readonly projectId: string;
  readonly bookNum: number;
  readonly chapterNum: number;
}

/** The largest chapter number accepted. No book has nearly this many chapters. */
const MAX_CHAPTER_NUMBER = 999;

export function parseChapterDocId(docId: string): ChapterDocId | undefined {
  const parts: string[] = docId.split(':');
  if (parts.length !== 4 || !isHexId(parts[0]) || parts[3] !== 'target') {
    return undefined;
  }
  const bookNum: number = Canon.bookIdToNumber(parts[1]);
  // bookIdToNumber gives 0 for an unknown book id. Requiring the id to round-trip refuses other spellings of a book.
  if (bookNum <= 0 || Canon.bookNumberToId(bookNum) !== parts[1]) {
    return undefined;
  }
  if (!/^(0|[1-9][0-9]*)$/.test(parts[2])) {
    return undefined;
  }
  const chapterNum: number = Number(parts[2]);
  if (chapterNum > MAX_CHAPTER_NUMBER) {
    return undefined;
  }
  return { projectId: parts[0], bookNum: bookNum, chapterNum: chapterNum };
}
