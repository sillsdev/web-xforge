import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';

export interface TextsByBookId {
  [bookId: string]: TextInfo;
}
