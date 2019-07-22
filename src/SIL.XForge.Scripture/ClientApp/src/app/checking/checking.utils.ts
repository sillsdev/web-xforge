import { Question } from '../core/models/question';
import { SFProjectUser } from '../core/models/sfproject-user';

export class CheckingUtils {
  static hasUserAnswered(question: Question, userId: string): boolean {
    if (question == null || question.answers == null) {
      return false;
    }
    return question.answers.filter(answer => answer.ownerRef === userId).length > 0;
  }

  static hasUserReadQuestion(question: Question, projectUser: SFProjectUser): boolean {
    return projectUser && projectUser.questionRefsRead ? projectUser.questionRefsRead.includes(question.id) : false;
  }
}
