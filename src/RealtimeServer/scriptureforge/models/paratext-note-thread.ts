import { ProjectData, PROJECT_DATA_INDEX_PATHS } from '../../common/models/project-data';
import { Note } from './note';
import { VerseRefData } from './verse-ref-data';

export const PARATEXT_NOTE_THREAD_COLLECTION = 'note_threads';
export const PARATEXT_NOTE_THREAD_INDEX_PATHS = PROJECT_DATA_INDEX_PATHS;

export interface ParatextNoteThread extends ProjectData {
  dataId: string;
  verseRef: VerseRefData;
  notes: Note[];
  selectedText: string;
  contextBefore: string;
  contextAfter: string;
  startPosition: number;
  tagIcon: string;
}
