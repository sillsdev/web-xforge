import { Question, QUESTIONS_COLLECTION } from 'realtime-server/lib/scriptureforge/models/question';
import { JsonRealtimeDoc } from 'xforge-common/models/json-realtime-doc';

/**
 * This is the real-time doc for a community checking question.
 */
export class QuestionDoc extends JsonRealtimeDoc<Question> {
  static readonly COLLECTION = QUESTIONS_COLLECTION;
}
