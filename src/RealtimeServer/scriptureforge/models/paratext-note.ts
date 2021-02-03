import { Comment } from "./comment";

export interface ParatextNote extends Comment {
  threadId: string;
  paratextUser: string;
  content: string;
  language: string;
  extUserId: string;
  versionNumber: number;
  deleted: boolean;
}
