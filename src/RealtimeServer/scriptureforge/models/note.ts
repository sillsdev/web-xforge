import { Comment } from './comment';
import { NoteStatus } from './note-thread';

export const REATTACH_SEPARATOR = '\uFFFC';

export interface Note extends Comment {
  threadId: string;
  type: string;
  conflictType: string;
  /**
   * Allows Paratext to keep a record of the SF user who created the note.
   * At the moment, this is the same as the owner ref.
   */
  extUserId: string;
  deleted: boolean;
  status: NoteStatus;
  tagIcon?: string;
  reattached?: string;
  assignment?: string;
  content?: string;
  acceptedChangeXml?: string;
}
