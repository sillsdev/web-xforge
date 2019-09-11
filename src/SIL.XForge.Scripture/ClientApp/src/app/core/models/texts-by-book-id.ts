import { TextInfo } from 'realtime-server/lib/scriptureforge/models/text-info';

export interface TextsByBookId {
  [bookId: string]: TextInfo;
}
