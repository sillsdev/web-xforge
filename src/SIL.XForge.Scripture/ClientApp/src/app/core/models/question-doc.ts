import { Question, QUESTIONS_COLLECTION } from 'realtime-server/lib/scriptureforge/models/question';
import { VerseRefData } from 'realtime-server/lib/scriptureforge/models/verse-ref-data';
import { JsonRealtimeDoc } from 'xforge-common/models/json-realtime-doc';
import { ScriptureReference } from './scripture-reference';

export function getQuestionDocId(projectId: string, questionId: string): string {
  return `${projectId}:${questionId}`;
}

/**
 * This is the real-time doc for a community checking question.
 */
export class QuestionDoc extends JsonRealtimeDoc<Question> implements ScriptureReference {
  static readonly COLLECTION = QUESTIONS_COLLECTION;

  get scriptureStart(): VerseRefData {
    return this.isLoaded ? this.data.scriptureStart : undefined;
  }

  get scriptureEnd(): VerseRefData {
    return this.isLoaded ? this.data.scriptureEnd : undefined;
  }
}
