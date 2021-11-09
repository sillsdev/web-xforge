import { ProjectData, PROJECT_DATA_INDEX_PATHS } from '../../common/models/project-data';
import { Note } from './note';
import { TextAnchor } from './text-anchor';
import { VerseRefData } from './verse-ref-data';

export const NOTE_THREAD_COLLECTION = 'note_threads';
export const NOTE_THREAD_INDEX_PATHS = PROJECT_DATA_INDEX_PATHS;

export interface NoteThread extends ProjectData {
  dataId: string;
  verseRef: VerseRefData;
  notes: Note[];
  originalSelectedText: string;
  originalContextBefore: string;
  originalContextAfter: string;
  position: TextAnchor;
  resolved: boolean;
  tagIcon: string;
}
