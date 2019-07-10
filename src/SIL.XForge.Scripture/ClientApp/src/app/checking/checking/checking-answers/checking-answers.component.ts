import { MdcDialog } from '@angular-mdc/web';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { clone } from '@orbit/utils';
import { User } from 'xforge-common/models/user';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { UserService } from 'xforge-common/user.service';
import { XFValidators } from 'xforge-common/xfvalidators';
import { Answer } from '../../../core/models/answer';
import { Comment } from '../../../core/models/comment';
import { Question } from '../../../core/models/question';
import { SFProject } from '../../../core/models/sfproject';
import { SFProjectRoles } from '../../../core/models/sfproject-roles';
import { SFProjectUser } from '../../../core/models/sfproject-user';
import { EditNameDialogComponent } from '../../../edit-name-dialog/edit-name-dialog.component';
import { AudioAttachment } from '../checking-audio-recorder/checking-audio-recorder.component';
import { CommentAction } from './checking-comments/checking-comments.component';

export interface AnswerAction {
  action: 'delete' | 'save' | 'show-form' | 'hide-form' | 'like' | 'recorder';
  answer?: Answer;
  text?: string;
  audio?: AudioAttachment;
}

@Component({
  selector: 'app-checking-answers',
  templateUrl: './checking-answers.component.html',
  styleUrls: ['./checking-answers.component.scss']
})
export class CheckingAnswersComponent extends SubscriptionDisposable {
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
    answerText: new FormControl()
  });
  answerFormVisible: boolean = false;
  answerFormSubmitAttempted: boolean = false;
  private user: User;
  private _question: Question;
  private initUserAnswerRefsRead: string[] = [];
  private audio: AudioAttachment = {};

  constructor(private readonly dialog: MdcDialog, private userService: UserService) {
    super();
    this.subscribe(this.userService.getCurrentUser(), u => (this.user = u));
  }

  get answers(): Answer[] {
    if (this.canSeeOtherUserResponses || this.isAdministrator) {
      return this.question.answers;
    } else {
      return this.question.answers.filter(answer => answer.ownerRef === this.userService.currentUserId);
    }
  }

  get canDownloadAudioFiles(): boolean {
    return this.project.downloadAudioFiles;
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

  generateAudioFileName(): string {
    return this.slugify(this.user.name) + '.webm';
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
    this.answerFormSubmitAttempted = false;
    this.activeAnswer = undefined;
    this.audio = {};
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

  recorderStatus(status: AudioAttachment): void {
    switch (status.status) {
      case 'reset':
        this.audio = {};
        break;
      case 'processed':
        this.audio.url = status.url;
        this.audio.blob = status.blob;
        this.audio.fileName = this.generateAudioFileName();
        break;
    }
    this.setValidationRules();
    this.action.emit({ action: 'recorder' });
  }

  showAnswerForm() {
    this.answerFormVisible = true;
    this.action.emit({
      action: 'show-form'
    });
  }

  submit(): void {
    this.setValidationRules();
    this.answerFormSubmitAttempted = true;
    if (this.answerForm.invalid) {
      return;
    }
    if (this.user.isNameConfirmed) {
      this.emitAnswerToSave();
      this.hideAnswerForm();
      return;
    }
    const dialogRef = this.dialog.open(EditNameDialogComponent, {
      data: { name: this.user.name, isConfirmation: true },
      escapeToClose: false,
      clickOutsideToClose: false
    });
    dialogRef.afterClosed().subscribe(async response => {
      await this.userService.updateCurrentUserAttributes({ name: response as string, isNameConfirmed: true });
      this.emitAnswerToSave();
      this.hideAnswerForm();
    });
  }

  submitCommentAction(action: CommentAction) {
    this.commentAction.emit({
      action: action.action,
      comment: action.comment,
      answer: action.answer,
      text: action.text
    });
  }

  private emitAnswerToSave() {
    this.action.emit({
      action: 'save',
      text: this.answerForm.get('answerText').value,
      answer: this.activeAnswer,
      audio: this.audio
    });
  }

  private setValidationRules(): void {
    if (this.audio.url) {
      this.answerForm.get('answerText').clearValidators();
    } else {
      this.answerForm.get('answerText').setValidators(Validators.required);
    }
    this.answerForm.get('answerText').updateValueAndValidity();
  }

  // TODO (NW) Move to a common place
  private slugify(text: string, separator: string = '-') {
    text = text
      .toString()
      .toLowerCase()
      .trim();

    const sets = [
      { to: 'a', from: '[ÀÁÂÃÄÅÆĀĂĄẠẢẤẦẨẪẬẮẰẲẴẶ]' },
      { to: 'c', from: '[ÇĆĈČ]' },
      { to: 'd', from: '[ÐĎĐÞ]' },
      { to: 'e', from: '[ÈÉÊËĒĔĖĘĚẸẺẼẾỀỂỄỆ]' },
      { to: 'g', from: '[ĜĞĢǴ]' },
      { to: 'h', from: '[ĤḦ]' },
      { to: 'i', from: '[ÌÍÎÏĨĪĮİỈỊ]' },
      { to: 'j', from: '[Ĵ]' },
      { to: 'ij', from: '[Ĳ]' },
      { to: 'k', from: '[Ķ]' },
      { to: 'l', from: '[ĹĻĽŁ]' },
      { to: 'm', from: '[Ḿ]' },
      { to: 'n', from: '[ÑŃŅŇ]' },
      { to: 'o', from: '[ÒÓÔÕÖØŌŎŐỌỎỐỒỔỖỘỚỜỞỠỢǪǬƠ]' },
      { to: 'oe', from: '[Œ]' },
      { to: 'p', from: '[ṕ]' },
      { to: 'r', from: '[ŔŖŘ]' },
      { to: 's', from: '[ßŚŜŞŠ]' },
      { to: 't', from: '[ŢŤ]' },
      { to: 'u', from: '[ÙÚÛÜŨŪŬŮŰŲỤỦỨỪỬỮỰƯ]' },
      { to: 'w', from: '[ẂŴẀẄ]' },
      { to: 'x', from: '[ẍ]' },
      { to: 'y', from: '[ÝŶŸỲỴỶỸ]' },
      { to: 'z', from: '[ŹŻŽ]' },
      { to: '-', from: "[·/_,:;']" }
    ];

    sets.forEach(set => {
      text = text.replace(new RegExp(set.from, 'gi'), set.to);
    });

    text = text
      .toString()
      .toLowerCase()
      .replace(/\s+/g, '-') // Replace spaces with -
      .replace(/&/g, '-and-') // Replace & with 'and'
      .replace(/[^\w\-]+/g, '') // Remove all non-word chars
      .replace(/\--+/g, '-') // Replace multiple - with single -
      .replace(/^-+/, '') // Trim - from start of text
      .replace(/-+$/, ''); // Trim - from end of text

    if (typeof separator !== 'undefined' && separator !== '-') {
      text = text.replace(/-/g, separator);
    }

    return text;
  }
}
