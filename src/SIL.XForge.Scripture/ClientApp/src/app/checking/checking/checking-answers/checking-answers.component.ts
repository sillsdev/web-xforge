import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { UserService } from 'xforge-common/user.service';
import { Answer } from '../../../core/models/answer';
import { Question } from '../../../core/models/question';
import { SFProjectUser } from '../../../core/models/sfproject-user';

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
  @Input() projectCurrentUser: SFProjectUser;
  @Input() set question(question: Question) {
    if (question !== this._question) {
      this.hideAnswerForm();
    }
    this._question = question;
  }
  @Output() action: EventEmitter<AnswerAction> = new EventEmitter<AnswerAction>();

  activeAnswer: Answer;
  answerForm: FormGroup = new FormGroup({
    answerText: new FormControl('', [Validators.required])
  });
  answerFormVisible: boolean = false;
  private _question: Question;

  constructor(private userService: UserService) {}

  get currentUserTotalAnswers(): number {
    return this.question.answers.filter(answer => (answer.ownerRef = this.userService.currentUserId)).length;
  }

  get hasUserRead(): boolean {
    return this.projectCurrentUser.questionRefsRead
      ? this.projectCurrentUser.questionRefsRead.includes(this.question.id)
      : false;
  }

  get question(): Question {
    return this._question;
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

  editAnswer(answer: Answer) {
    this.activeAnswer = answer;
    this.showAnswerForm();
  }

  deleteAnswer(answer: Answer) {
    this.action.emit({
      action: 'delete',
      answer: answer
    });
  }

  showAnswerForm() {
    this.answerFormVisible = true;
    this.action.emit({
      action: 'show-form'
    });
  }

  hideAnswerForm() {
    this.answerFormVisible = false;
    this.activeAnswer = undefined;
    this.answerForm.reset();
    this.action.emit({
      action: 'hide-form'
    });
  }

  hasPermission(answer: Answer, permission: string): boolean {
    // TODO: Improve permission checking in later Jira task
    return this.userService.currentUserId === answer.ownerRef;
  }

  likeAnswer(answer: Answer) {
    this.action.emit({
      action: 'like',
      answer: answer
    });
  }
}
