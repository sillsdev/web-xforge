import { VerseRef } from '@sillsdev/scripture';
import { NoteStatus } from 'realtime-server/lib/esm/scriptureforge/models/note-thread';

export interface SaveNoteParameters {
  content?: string;
  dataId?: string;
  threadDataId?: string;
  verseRef?: VerseRef;
  biblicalTermId?: string;
  status?: NoteStatus;
}
