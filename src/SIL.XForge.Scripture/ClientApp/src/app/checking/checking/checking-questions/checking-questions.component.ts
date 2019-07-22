import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { UserService } from 'xforge-common/user.service';
import { Answer } from '../../../core/models/answer';
import { Comment } from '../../../core/models/comment';
import { Question } from '../../../core/models/question';
import { SFProject } from '../../../core/models/sfproject';
import { SFProjectRoles } from '../../../core/models/sfproject-roles';
import { SFProjectUser } from '../../../core/models/sfproject-user';
import { SFProjectUserService } from '../../../core/sfproject-user.service';
import { CheckingUtils } from '../../checking.utils';

@Component({
  selector: 'app-checking-questions',
  templateUrl: './checking-questions.component.html',
  styleUrls: ['./checking-questions.component.scss']
})
export class CheckingQuestionsComponent extends SubscriptionDisposable {
  @Input() project: SFProject;
  @Input() projectCurrentUser: SFProjectUser;
  @Input() comments: Readonly<Comment[]> = [];
  @Output() update: EventEmitter<Question> = new EventEmitter<Question>();
  @Output() changed: EventEmitter<Question> = new EventEmitter<Question>();
  _questions: Readonly<Question[]> = [];
  activeQuestion: Question;
  activeQuestionSubject: Subject<Question> = new Subject<Question>();

  constructor(private userService: UserService, private projectUserService: SFProjectUserService) {
    super();
    // Only mark as read if it has been viewed for a set period of time and not an accidental click
    this.subscribe(this.activeQuestionSubject.pipe(debounceTime(2000)), question => {
      let updateRequired = false;
      if (!this.hasUserReadQuestion(question)) {
        this.projectCurrentUser.questionRefsRead.push(question.id);
        updateRequired = true;
      }
      if (this.hasUserAnswered(question) || this.isAdministrator) {
        for (const answer of this.getAnswers(question)) {
          if (!this.hasUserReadAnswer(answer)) {
            this.projectCurrentUser.answerRefsRead.push(answer.id);
            updateRequired = true;
          }
        }
      }
      for (const answer of this.getAnswers(question)) {
        const comments = this.getAnswerComments(answer);
        let readLimit = 3;
        if (comments.length > 3) {
          readLimit = 2;
        }
        let commentCount = 0;
        for (const comment of comments) {
          if (!this.hasUserReadComment(comment)) {
            this.projectCurrentUser.commentRefsRead.push(comment.id);
            updateRequired = true;
          }
          commentCount++;
          if (commentCount === readLimit) {
            break;
          }
        }
      }
      if (updateRequired) {
        this.projectUserService.update(this.projectCurrentUser).then(() => {
          this.update.emit(question);
        });
      }
    });
  }

  get activateQuestionChapter(): number {
    return parseInt(this.activeQuestion.scriptureStart.chapter, 10);
  }

  get activeQuestionIndex(): number {
    return this.questions.findIndex(question => question.id === this.activeQuestion.id);
  }

  get questions(): Readonly<Question[]> {
    return this._questions;
  }

  @Input() set questions(questions: Readonly<Question[]>) {
    if (questions.length) {
      this.activateQuestion(questions[Object.keys(questions)[0]]);
    } else {
      this.activeQuestion = undefined;
    }
    this._questions = questions;
  }

  getAnswers(question: Question): Answer[] {
    if (this.project.usersSeeEachOthersResponses || this.isAdministrator) {
      return question.answers;
    } else {
      return question.answers.filter(answer => answer.ownerRef === this.userService.currentUserId);
    }
  }

  getAnswerComments(answer: Answer): Comment[] {
    return this.comments
      .filter(comment => comment.answerRef === answer.id)
      .sort((a: Comment, b: Comment) => {
        return new Date(a.dateCreated).getTime() - new Date(b.dateCreated).getTime();
      });
  }

  getUnreadAnswers(question: Question): number {
    let unread = 0;
    if (!this.isAdministrator && !this.project.usersSeeEachOthersResponses) {
      return unread;
    }
    for (const answer of this.getAnswers(question)) {
      if (!this.hasUserReadAnswer(answer)) {
        unread++;
      }
    }
    for (const answer of this.getAnswers(question)) {
      for (const comment of this.getAnswerComments(answer)) {
        if (!this.hasUserReadComment(comment)) {
          unread++;
        }
      }
    }
    return unread;
  }

  checkCanChangeQuestion(newIndex: number): boolean {
    return !!this.questions[this.activeQuestionIndex + newIndex];
  }

  hasUserAnswered(question: Question): boolean {
    return CheckingUtils.hasUserAnswered(question, this.userService.currentUserId);
  }

  hasUserReadQuestion(question: Question): boolean {
    return CheckingUtils.hasUserReadQuestion(question, this.projectCurrentUser);
  }

  hasUserReadAnswer(answer: Answer): boolean {
    return this.projectCurrentUser.answerRefsRead
      ? this.projectCurrentUser.answerRefsRead.includes(answer.id) ||
          this.projectCurrentUser.userRef === answer.ownerRef
      : false;
  }

  hasUserReadComment(comment: Comment): boolean {
    return this.projectCurrentUser.commentRefsRead
      ? this.projectCurrentUser.commentRefsRead.includes(comment.id) ||
          this.projectCurrentUser.userRef === comment.ownerRef
      : false;
  }

  get isAdministrator(): boolean {
    return this.projectCurrentUser.role === SFProjectRoles.ParatextAdministrator;
  }

  nextQuestion(): void {
    this.changeQuestion(1);
  }

  previousQuestion(): void {
    this.changeQuestion(-1);
  }

  activateQuestion(question: Question): void {
    this.activeQuestion = question;
    this.changed.emit(question);
    this.activeQuestionSubject.next(question);
  }

  private changeQuestion(newDifferential: number): void {
    if (this.activeQuestion && this.checkCanChangeQuestion(newDifferential)) {
      this.activateQuestion(this.questions[this.activeQuestionIndex + newDifferential]);
    }
  }
}
