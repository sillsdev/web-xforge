import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { clone } from '@orbit/utils';
import { AccountService } from 'xforge-common/account.service';
import { UserDoc } from 'xforge-common/models/user-doc';
import { UserService } from 'xforge-common/user.service';
import { Answer } from '../../../core/models/answer';
import { Comment } from '../../../core/models/comment';
import { Question } from '../../../core/models/question';
import { SFProject } from '../../../core/models/sfproject';
import { SFProjectRoles } from '../../../core/models/sfproject-roles';
import { SFProjectUser } from '../../../core/models/sfproject-user';
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
export class CheckingAnswersComponent implements OnInit {
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
  uploadAudioFile: File;
  uploadAudioFileUrl: string = '';

  private user: UserDoc;
  private _question: Question;
  private initUserAnswerRefsRead: string[] = [];
  private audio: AudioAttachment = {};

  constructor(private accountService: AccountService, private userService: UserService) {}

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
    return this.projectCurrentUser != null && this.projectCurrentUser.questionRefsRead
      ? this.projectCurrentUser.questionRefsRead.includes(this.question.id)
      : false;
  }

  get isAdministrator(): boolean {
    return this.projectCurrentUser.role === SFProjectRoles.ParatextAdministrator;
  }

  get isRecorderActive(): boolean {
    return this.audio.status && this.audio.status !== 'denied' && this.audio.status !== 'reset';
  }

  get isUploaderActive(): boolean {
    return this.uploadAudioFileUrl !== '';
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

  ngOnInit(): void {
    this.userService.getCurrentUser().then(u => (this.user = u));
  }

  deleteAnswer(answer: Answer) {
    this.action.emit({
      action: 'delete',
      answer: answer
    });
  }

  editAnswer(answer: Answer) {
    this.activeAnswer = clone(answer);
    this.audio.url = this.activeAnswer.audioUrl;
    this.uploadAudioFileUrl = this.activeAnswer.audioUrl;
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
    return this.initUserAnswerRefsRead.includes(answer.id) || this.projectCurrentUser.userRef === answer.ownerRef;
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

  prepareAudioFileUpload() {
    if (this.uploadAudioFile) {
      this.uploadAudioFileUrl = URL.createObjectURL(this.uploadAudioFile);
      this.audio.url = this.uploadAudioFileUrl;
      this.audio.blob = this.uploadAudioFile;
      this.audio.fileName = this.uploadAudioFile.name;
    }
  }

  recorderStatus(status: AudioAttachment): void {
    this.audio.status = status.status;
    switch (status.status) {
      case 'reset':
        this.audio = {};
        break;
      case 'processed':
        this.audio.url = status.url;
        this.audio.blob = status.blob;
        this.audio.fileName = status.fileName;
        break;
    }
    this.setValidationRules();
    this.action.emit({ action: 'recorder' });
  }

  resetAudioFileUpload() {
    this.uploadAudioFile = null;
    this.uploadAudioFileUrl = '';
    this.audio = { status: 'reset' };
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
    if (this.user.data.isNameConfirmed) {
      this.emitAnswerToSave();
      this.hideAnswerForm();
      return;
    }
    const dialogRef = this.accountService.openNameDialog(this.user.data.name, true);
    dialogRef.afterClosed().subscribe(async response => {
      await this.user.submitJson0Op(op => {
        op.set(u => u.name, response as string);
        op.set<boolean>(u => u.isNameConfirmed, true);
      });
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
    this.resetAudioFileUpload();
  }

  private setValidationRules(): void {
    if (this.audio.url) {
      this.answerForm.get('answerText').clearValidators();
    } else {
      this.answerForm.get('answerText').setValidators(Validators.required);
    }
    this.answerForm.get('answerText').updateValueAndValidity();
  }
}
