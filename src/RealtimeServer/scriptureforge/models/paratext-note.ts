import { Comment } from "./comment";

export interface ParatextNote extends Comment {
  threadId: string;
  content: string;
  extUserId: string;
  deleted: boolean;
  tagIcon?: string;
}
