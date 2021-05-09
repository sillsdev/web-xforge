import { TextInfo } from 'realtime-server/lib/cjs/scriptureforge/models/text-info';

export interface TextsByBookId {
  [bookId: string]: TextInfo;
}
