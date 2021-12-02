import { Comment } from './comment';
import { NoteStatus } from './note-thread';

export interface Note extends Comment {
  threadId: string;
  content?: string;
  extUserId: string;
  deleted: boolean;
  tagIcon?: string;
  status: NoteStatus;
  reattached?: string;
}
