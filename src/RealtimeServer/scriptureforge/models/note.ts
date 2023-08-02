import { Comment } from './comment';
import { NoteStatus } from './note-thread';

export const REATTACH_SEPARATOR = '\uFFFC';

export interface Note extends Comment {
  threadId: string;
  type: string;
  conflictType: string;
  status: NoteStatus;
  tagId?: number;
  reattached?: string;
  assignment?: string;
  content?: string;
  acceptedChangeXml?: string;
  editable?: boolean;
  versionNumber?: number;
}
