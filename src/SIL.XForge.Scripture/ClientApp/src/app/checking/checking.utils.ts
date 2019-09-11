import { Question } from 'realtime-server/lib/scriptureforge/models/question';
import { SFProjectUserConfig } from 'realtime-server/lib/scriptureforge/models/sf-project-user-config';

export class CheckingUtils {
  static hasUserAnswered(question: Question, userId: string): boolean {
    if (question == null) {
      return false;
    }
    return question.answers.filter(answer => answer.ownerRef === userId).length > 0;
  }

  static hasUserReadQuestion(question: Question, projectUserConfig: SFProjectUserConfig): boolean {
    return projectUserConfig ? projectUserConfig.questionRefsRead.includes(question.dataId) : false;
  }
}
