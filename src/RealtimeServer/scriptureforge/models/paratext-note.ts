import { Comment } from "./comment";

export interface ParatextNote extends Comment {
  threadId: string;
  paratextUser: string;
  content: string;
  extUserId: string;
  versionNumber: number;
  deleted: boolean;
}
