import { Comment } from "./comment";

export interface ParatextNote extends Comment {
  threadId: string;
  content: string;
  language: string;
  extUserId: string;
  versionNumber: number;
  deleted: boolean;
}
