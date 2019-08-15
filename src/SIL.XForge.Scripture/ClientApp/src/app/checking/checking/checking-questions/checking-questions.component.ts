import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Answer } from 'realtime-server/lib/scriptureforge/models/answer';
import { Comment } from 'realtime-server/lib/scriptureforge/models/comment';
import { Question } from 'realtime-server/lib/scriptureforge/models/question';
import { SFProject } from 'realtime-server/lib/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/scriptureforge/models/sf-project-role';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { UserService } from 'xforge-common/user.service';
import { SFProjectUserConfigDoc } from '../../../core/models/sf-project-user-config-doc';
import { CheckingUtils } from '../../checking.utils';

@Component({
  selector: 'app-checking-questions',
  templateUrl: './checking-questions.component.html',
  styleUrls: ['./checking-questions.component.scss']
})
export class CheckingQuestionsComponent extends SubscriptionDisposable {
  @Input() project: SFProject;
  @Input() projectUserConfigDoc: SFProjectUserConfigDoc;
  @Input() comments: Readonly<Comment[]> = [];
  @Output() update: EventEmitter<Question> = new EventEmitter<Question>();
  @Output() changed: EventEmitter<Question> = new EventEmitter<Question>();
  _questions: Readonly<Question[]> = [];
  activeQuestion: Question;
  activeQuestionSubject: Subject<Question> = new Subject<Question>();

  constructor(private userService: UserService) {
    super();
    // Only mark as read if it has been viewed for a set period of time and not an accidental click
    this.subscribe(this.activeQuestionSubject.pipe(debounceTime(2000)), question => {
      this.updateElementsRead(question);
    });
  }

  get activeQuestionChapter(): number {
    return parseInt(this.activeQuestion.scriptureStart.chapter, 10);
  }

  get activeQuestionIndex(): number {
    return this.questions.findIndex(question => question.id === this.activeQuestion.id);
  }

  get isAdministrator(): boolean {
    return this.project.userRoles[this.projectUserConfigDoc.data.ownerRef] === SFProjectRole.ParatextAdministrator;
  }

  get questions(): Readonly<Question[]> {
    return this._questions;
  }

  @Input() set questions(questions: Readonly<Question[]>) {
    if (questions.length) {
      if (this.activeQuestion == null) {
        this.activateQuestion(questions[Object.keys(questions)[0]]);
      }
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

  updateElementsRead(question: Question): void {
    this.projectUserConfigDoc
      .submitJson0Op(op => {
        if (!this.hasUserReadQuestion(question)) {
          op.add(puc => puc.questionRefsRead, question.id);
        }
        if (this.hasUserAnswered(question) || this.isAdministrator) {
          for (const answer of this.getAnswers(question)) {
            if (!this.hasUserReadAnswer(answer)) {
              op.add(puc => puc.answerRefsRead, answer.id);
            }
            const comments = this.getAnswerComments(answer);
            let readLimit = 3;
            if (comments.length > 3) {
              readLimit = 2;
            }
            let commentCount = 0;
            for (const comment of comments) {
              if (!this.hasUserReadComment(comment)) {
                op.add(puc => puc.commentRefsRead, comment.id);
              }
              commentCount++;
              if (commentCount === readLimit) {
                break;
              }
            }
          }
        }
      })
      .then(updated => {
        if (updated) {
          this.update.emit(question);
        }
      });
  }

  checkCanChangeQuestion(newIndex: number): boolean {
    return !!this.questions[this.activeQuestionIndex + newIndex];
  }

  hasUserAnswered(question: Question): boolean {
    return CheckingUtils.hasUserAnswered(question, this.userService.currentUserId);
  }

  hasUserReadQuestion(question: Question): boolean {
    return CheckingUtils.hasUserReadQuestion(question, this.projectUserConfigDoc.data);
  }

  hasUserReadAnswer(answer: Answer): boolean {
    return this.projectUserConfigDoc.data.answerRefsRead
      ? this.projectUserConfigDoc.data.answerRefsRead.includes(answer.id) ||
          this.projectUserConfigDoc.data.ownerRef === answer.ownerRef
      : false;
  }

  hasUserReadComment(comment: Comment): boolean {
    return this.projectUserConfigDoc.data.commentRefsRead
      ? this.projectUserConfigDoc.data.commentRefsRead.includes(comment.id) ||
          this.projectUserConfigDoc.data.ownerRef === comment.ownerRef
      : false;
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
