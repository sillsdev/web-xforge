import { Comment } from './comment';

export interface Note extends Comment {
  threadId: string;
  content: string;
  extUserId: string;
  deleted: boolean;
  tagIcon?: string;
}
