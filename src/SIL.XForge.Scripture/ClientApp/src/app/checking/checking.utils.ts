import { Question } from '../core/models/question';
import { SFProjectUserConfig } from '../core/models/sfproject-user-config';

export class CheckingUtils {
  static hasUserAnswered(question: Question, userId: string): boolean {
    if (question == null || question.answers == null) {
      return false;
    }
    return question.answers.filter(answer => answer.ownerRef === userId).length > 0;
  }

  static hasUserReadQuestion(question: Question, projectUserConfig: SFProjectUserConfig): boolean {
    return projectUserConfig && projectUserConfig.questionRefsRead
      ? projectUserConfig.questionRefsRead.includes(question.id)
      : false;
  }
}
