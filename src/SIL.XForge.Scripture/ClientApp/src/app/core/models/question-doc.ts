import { Question, QUESTIONS_COLLECTION } from 'realtime-server/lib/scriptureforge/models/question';
import { toVerseRef } from 'realtime-server/lib/scriptureforge/models/verse-ref-data';
import { VerseRef } from 'realtime-server/lib/scriptureforge/scripture-utils/verse-ref';
import { JsonRealtimeDoc } from 'xforge-common/models/json-realtime-doc';

/**
 * This is the real-time doc for a community checking question.
 */
export class QuestionDoc extends JsonRealtimeDoc<Question> {
  static readonly COLLECTION = QUESTIONS_COLLECTION;

  get verseRef(): VerseRef {
    if (!this.isLoaded) {
      return undefined;
    }
    return toVerseRef(this.data.verseRef);
  }
}
