import { RealtimeData } from 'xforge-common/models/realtime-data';
import { RealtimeDoc } from 'xforge-common/realtime-doc';
import { RealtimeOfflineStore } from 'xforge-common/realtime-offline-store';
import { Question } from './question';

export class QuestionData extends RealtimeData<Question[], QuestionOp[]> {
  static readonly TYPE = 'question';

  constructor(doc: RealtimeDoc, store: RealtimeOfflineStore) {
    super(QuestionData.TYPE, doc, store);
  }

  protected prepareDataForStore(data: Question[]): any {
    return data;
  }
}

export interface QuestionOp {
  p: (string | number)[];
  na?: number;
  li?: object;
  ld?: object;
  lm?: number;
  oi?: object;
  od?: object;
  t?: string;
  o?: object[];
  si?: string;
  sd?: string;
}
