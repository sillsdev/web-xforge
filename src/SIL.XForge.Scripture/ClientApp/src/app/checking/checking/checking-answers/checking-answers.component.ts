import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { clone } from '@orbit/utils';
import { UserService } from 'xforge-common/user.service';
import { XFValidators } from 'xforge-common/xfvalidators';
import { Answer } from '../../../core/models/answer';
import { Comment } from '../../../core/models/comment';
import { Question } from '../../../core/models/question';
import { SFProject } from '../../../core/models/sfproject';
import { SFProjectRoles } from '../../../core/models/sfproject-roles';
import { SFProjectUser } from '../../../core/models/sfproject-user';
import { CommentAction } from './checking-comments/checking-comments.component';

export interface AnswerAction {
  action: 'delete' | 'save' | 'show-form' | 'hide-form' | 'like';
  answer?: Answer;
  text?: string;
}

@Component({
  selector: 'app-checking-answers',
  templateUrl: './checking-answers.component.html',
  styleUrls: ['./checking-answers.component.scss']
})
export class CheckingAnswersComponent {
  @Input() project: SFProject;
  @Input() projectCurrentUser: SFProjectUser;
  @Input() set question(question: Question) {
    if (question !== this._question) {
      this.hideAnswerForm();
    }
    this._question = question;
    this.initUserAnswerRefsRead = clone(this.projectCurrentUser.answerRefsRead);
  }
  @Input() comments: Readonly<Comment[]> = [];
  @Output() action: EventEmitter<AnswerAction> = new EventEmitter<AnswerAction>();
  @Output() commentAction: EventEmitter<CommentAction> = new EventEmitter<CommentAction>();

  activeAnswer: Answer;
  answerForm: FormGroup = new FormGroup({
    answerText: new FormControl('', [Validators.required, XFValidators.someNonWhitespace])
  });
  answerFormVisible: boolean = false;
  private _question: Question;
  private initUserAnswerRefsRead: string[] = [];

  constructor(private userService: UserService) {}

  get answers(): Answer[] {
    if (this.canSeeOtherUserResponses || this.isAdministrator) {
      return this.question.answers;
    } else {
      return this.question.answers.filter(answer => answer.ownerRef === this.userService.currentUserId);
    }
  }

  get canSeeOtherUserResponses(): boolean {
    return this.project.usersSeeEachOthersResponses;
  }

  get currentUserTotalAnswers(): number {
    return this.question.answers.filter(answer => answer.ownerRef === this.userService.currentUserId).length;
  }

  get hasUserRead(): boolean {
    return this.projectCurrentUser.questionRefsRead
      ? this.projectCurrentUser.questionRefsRead.includes(this.question.id)
      : false;
  }

  get isAdministrator(): boolean {
    return this.projectCurrentUser.role === SFProjectRoles.ParatextAdministrator;
  }

  get question(): Question {
    return this._question;
  }

  get totalAnswersHeading(): string {
    if (this.canSeeOtherUserResponses || this.isAdministrator) {
      return this.answers.length + ' Answers';
    } else {
      return 'Your Answer';
    }
  }

  deleteAnswer(answer: Answer) {
    this.action.emit({
      action: 'delete',
      answer: answer
    });
  }

  editAnswer(answer: Answer) {
    this.activeAnswer = answer;
    this.showAnswerForm();
  }

  getComments(answer: Answer): Comment[] {
    return this.comments
      .filter(comment => comment.answerRef === answer.id)
      .sort((a: Comment, b: Comment) => {
        return new Date(a.dateCreated).getTime() - new Date(b.dateCreated).getTime();
      });
  }

  hasPermission(answer: Answer, permission: string): boolean {
    if (this.userService.currentUserId === answer.ownerRef) {
      return true;
    } else if (permission === 'delete' && this.isAdministrator) {
      return true;
    }
    return false;
  }

  hasUserReadAnswer(answer: Answer): boolean {
    return this.initUserAnswerRefsRead.includes(answer.id) || this.projectCurrentUser.user.id === answer.ownerRef;
  }

  hideAnswerForm() {
    this.answerFormVisible = false;
    this.activeAnswer = undefined;
    this.answerForm.reset();
    this.action.emit({
      action: 'hide-form'
    });
  }

  likeAnswer(answer: Answer) {
    this.action.emit({
      action: 'like',
      answer: answer
    });
  }

  showAnswerForm() {
    this.answerFormVisible = true;
    this.action.emit({
      action: 'show-form'
    });
  }

  submit(): void {
    if (this.answerForm.invalid) {
      return;
    }
    this.action.emit({
      action: 'save',
      text: this.answerForm.get('answerText').value,
      answer: this.activeAnswer
    });
    this.hideAnswerForm();
  }

  submitCommentAction(action: CommentAction) {
    this.commentAction.emit({
      action: action.action,
      comment: action.comment,
      answer: action.answer,
      text: action.text
    });
  }
}
