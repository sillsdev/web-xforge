import { Comment } from './comment';

export const COMMENTS_COLLECTION = 'comments';

export interface CommentList {
  comments: Comment[];
}
