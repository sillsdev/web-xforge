import { ProjectData, PROJECT_DATA_INDEX_PATHS } from '../../common/models/project-data';
import { Note } from './note';
import { TextAnchor } from './text-anchor';
import { VerseRefData } from './verse-ref-data';

export const NOTE_THREAD_COLLECTION = 'note_threads';
export const NOTE_THREAD_INDEX_PATHS = PROJECT_DATA_INDEX_PATHS;

/**
 * Paratext used to record notes as deleted when completed but then changed to display them as resolved
 * Done is also a backwards compatible status that could also be treated as deleted/resolved
 */
export enum NoteStatus {
  Unspecified = '',
  Todo = 'todo',
  Done = 'done',
  Resolved = 'deleted'
}

export enum AssignedUsers {
  Unspecified = '',
  TeamUser = 'Team'
}

export interface NoteThread extends ProjectData {
  dataId: string;
  verseRef: VerseRefData;
  notes: Note[];
  originalSelectedText: string;
  originalContextBefore: string;
  originalContextAfter: string;
  position: TextAnchor;
  status: NoteStatus;
  tagIcon: string;
  assignedUserRef?: string;
  assignedPTUsername?: string;
}
