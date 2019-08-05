import { ErrorStateMatcher, MdcDialog, MdcDialogConfig } from '@angular-mdc/web';
import { Component, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, FormGroupDirective, NgForm, Validators } from '@angular/forms';
import cloneDeep from 'lodash/cloneDeep';
import { AccountService } from 'xforge-common/account.service';
import { UserDoc } from 'xforge-common/models/user-doc';
import { UserService } from 'xforge-common/user.service';
import { Answer } from '../../../core/models/answer';
import { Comment } from '../../../core/models/comment';
import { Question } from '../../../core/models/question';
import { ScrVers } from '../../../core/models/scripture/scr-vers';
import { VerseRef } from '../../../core/models/scripture/verse-ref';
import { SFProject } from '../../../core/models/sfproject';
import { SFProjectRoles } from '../../../core/models/sfproject-roles';
import { SFProjectUserConfigDoc } from '../../../core/models/sfproject-user-config-doc';
import { TextInfo, TextsByBook } from '../../../core/models/text-info';
import { VerseRefData } from '../../../core/models/verse-ref-data';
import {
  ScriptureChooserDialogComponent,
  ScriptureChooserDialogData
} from '../../../scripture-chooser-dialog/scripture-chooser-dialog.component';
import { SFValidators } from '../../../shared/sfvalidators';
import { CheckingAudioCombinedComponent } from '../checking-audio-combined/checking-audio-combined.component';
import { AudioAttachment } from '../checking-audio-recorder/checking-audio-recorder.component';
import { CheckingTextComponent } from '../checking-text/checking-text.component';
import { CommentAction } from './checking-comments/checking-comments.component';

export interface AnswerAction {
  action: 'delete' | 'save' | 'show-form' | 'hide-form' | 'like' | 'recorder';
  answer?: Answer;
  text?: string;
  scriptureStart?: VerseRefData;
  scriptureEnd?: VerseRefData;
  scriptureText?: string;
  audio?: AudioAttachment;
}

@Component({
  selector: 'app-checking-answers',
  templateUrl: './checking-answers.component.html',
  styleUrls: ['./checking-answers.component.scss']
})
export class CheckingAnswersComponent implements OnInit {
  private static verseRefDataToString(verseRefData: VerseRefData): string {
    let result: string = verseRefData.book ? verseRefData.book : '';
    result += verseRefData.chapter ? ' ' + verseRefData.chapter : '';
    result += verseRefData.verse ? ':' + verseRefData.verse : '';
    return result;
  }

  private static verseRefToVerseRefData(input: VerseRef): VerseRefData {
    const refData: VerseRefData = {};
    refData.book = input.book;
    refData.chapter = input.chapter;
    refData.verse = input.verse;
    refData.versification = input.versification.name;
    return refData;
  }

  @ViewChild(CheckingAudioCombinedComponent) audioCombinedComponent: CheckingAudioCombinedComponent;
  @Input() project: SFProject;
  @Input() projectUserConfigDoc: SFProjectUserConfigDoc;
  @Input() projectText: TextInfo;
  @Input() set question(question: Question) {
    if (question !== this._question) {
      this.hideAnswerForm();
    }
    this._question = question;
    this.initUserAnswerRefsRead = cloneDeep(this.projectUserConfigDoc.data.answerRefsRead);
  }
  @Input() checkingTextComponent: CheckingTextComponent;
  @Input() comments: Readonly<Comment[]> = [];
  @Output() action: EventEmitter<AnswerAction> = new EventEmitter<AnswerAction>();
  @Output() commentAction: EventEmitter<CommentAction> = new EventEmitter<CommentAction>();

  activeAnswer: Answer;
  answerForm: FormGroup = new FormGroup({
    answerText: new FormControl(),
    scriptureStart: new FormControl(),
    scriptureEnd: new FormControl(),
    scriptureText: new FormControl()
  });
  answerFormVisible: boolean = false;
  answerFormSubmitAttempted: boolean = false;
  parentAndStartMatcher = new ParentAndStartErrorStateMatcher();

  private user: UserDoc;
  private _question: Question;
  private initUserAnswerRefsRead: string[] = [];
  private audio: AudioAttachment = {};

  constructor(private accountService: AccountService, private userService: UserService, readonly dialog: MdcDialog) {}

  get answerText(): AbstractControl {
    return this.answerForm.controls.answerText;
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

  get canShowScriptureInput(): boolean {
    return !!(
      this.scriptureStart.valid &&
      this.scriptureEnd.valid &&
      this.scriptureEnd.value &&
      this.scriptureText.value
    );
  }

  get currentUserTotalAnswers(): number {
    return this.question.answers.filter(answer => answer.ownerRef === this.userService.currentUserId).length;
  }

  get hasUserRead(): boolean {
    return this.projectUserConfigDoc != null && this.projectUserConfigDoc.data.questionRefsRead
      ? this.projectUserConfigDoc.data.questionRefsRead.includes(this.question.id)
      : false;
  }

  get isAdministrator(): boolean {
    return this.project.userRoles[this.projectUserConfigDoc.data.ownerRef] === SFProjectRoles.ParatextAdministrator;
  }

  get question(): Question {
    return this._question;
  }

  get scriptureStart(): AbstractControl {
    return this.answerForm.controls.scriptureStart;
  }

  get scriptureStartVerseRef(): VerseRef {
    return VerseRef.fromStr(this.scriptureStart.value, ScrVers.English);
  }

  get scriptureEnd(): AbstractControl {
    return this.answerForm.controls.scriptureEnd;
  }

  get scriptureEndVerseRef(): VerseRef {
    return VerseRef.fromStr(this.scriptureEnd.value, ScrVers.English);
  }

  get scriptureText(): AbstractControl {
    return this.answerForm.controls.scriptureText;
  }

  get textsByBook(): TextsByBook {
    const textsByBook: TextsByBook = {};
    if (this.projectText) {
      textsByBook[this.projectText.bookId] = this.projectText;
    }
    return textsByBook;
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
    this.scriptureStart.setValidators([SFValidators.verseStr(this.textsByBook)]);
    this.scriptureStart.updateValueAndValidity();
    this.scriptureEnd.setValidators([SFValidators.verseStr(this.textsByBook)]);
    this.scriptureEnd.updateValueAndValidity();
  }

  checkScriptureText(): void {
    if (!this.scriptureText.value) {
      this.resetScriptureText();
    }
  }

  deleteAnswer(answer: Answer) {
    this.action.emit({
      action: 'delete',
      answer: answer
    });
  }

  editAnswer(answer: Answer) {
    this.activeAnswer = cloneDeep(answer);
    this.audio.url = this.activeAnswer.audioUrl;
    this.scriptureStart.setValue(CheckingAnswersComponent.verseRefDataToString(this.activeAnswer.scriptureStart));
    this.scriptureEnd.setValue(CheckingAnswersComponent.verseRefDataToString(this.activeAnswer.scriptureEnd));
    this.scriptureText.setValue(this.activeAnswer.scriptureText);
    this.showAnswerForm();
  }

  extractScriptureText() {
    const verseStart = this.scriptureStartVerseRef;
    const verseEnd = this.scriptureEnd.value ? this.scriptureEndVerseRef : verseStart;
    const verses = [];
    if (verseStart.verseNum > 0) {
      for (let verse = verseStart.verseNum; verse <= verseEnd.verseNum; verse++) {
        verses.push(
          this.checkingTextComponent.textComponent.getSegmentText('verse_' + verseStart.chapter + '_' + verse)
        );
      }
    }
    this.scriptureText.setValue(verses.length ? verses.join(' ') : null);
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
    return (
      this.initUserAnswerRefsRead.includes(answer.id) || this.projectUserConfigDoc.data.ownerRef === answer.ownerRef
    );
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

  openScriptureChooser(control: AbstractControl) {
    const currentVerseSelection = CheckingAnswersComponent.verseRefToVerseRefData(
      VerseRef.fromStr(control.value, ScrVers.English)
    );

    let rangeStart: VerseRefData;
    if (control !== this.scriptureStart) {
      rangeStart = CheckingAnswersComponent.verseRefToVerseRefData(
        VerseRef.fromStr(this.scriptureStart.value, ScrVers.English)
      );
    }

    const dialogConfig: MdcDialogConfig<ScriptureChooserDialogData> = {
      data: { input: currentVerseSelection, booksAndChaptersToShow: this.textsByBook, rangeStart }
    };

    const dialogRef = this.dialog.open(ScriptureChooserDialogComponent, dialogConfig);
    dialogRef.afterClosed().subscribe((result: VerseRefData) => {
      if (result !== 'close') {
        control.setValue(CheckingAnswersComponent.verseRefDataToString(result));
        control.markAsTouched();
        control.markAsDirty();
        this.extractScriptureText();
      }
    });
  }

  processAudio(audio: AudioAttachment) {
    this.audio = audio;
  }

  resetScriptureText() {
    this.scriptureText.reset();
    this.scriptureStart.reset();
    this.scriptureEnd.reset();
  }

  scriptureTextVerseRef(answer: Answer): string {
    return (
      '(' +
      CheckingAnswersComponent.verseRefDataToString(answer.scriptureStart) +
      (answer.scriptureEnd.verse && answer.scriptureStart.verse !== answer.scriptureEnd.verse
        ? '-' + answer.scriptureEnd.verse
        : '') +
      ')'
    );
  }

  showAnswerForm() {
    this.answerFormVisible = true;
    this.action.emit({
      action: 'show-form'
    });
  }

  async submit() {
    if (this.audio.status === 'recording') {
      await this.audioCombinedComponent.audioRecorderComponent.stopRecording();
    }
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
      text: this.answerText.value,
      answer: this.activeAnswer,
      audio: this.audio,
      scriptureText: this.scriptureText.value,
      scriptureStart: CheckingAnswersComponent.verseRefToVerseRefData(this.scriptureStartVerseRef),
      scriptureEnd: CheckingAnswersComponent.verseRefToVerseRefData(this.scriptureEndVerseRef)
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
}

class ParentAndStartErrorStateMatcher implements ErrorStateMatcher {
  isErrorState(control: FormControl | null, form: FormGroupDirective | NgForm | null): boolean {
    const invalidCtrl = !!(control && control.invalid);
    const invalidStart = !!(
      control &&
      control.parent &&
      control.parent.controls &&
      control.parent.controls['scriptureStart'] &&
      control.parent.controls['scriptureStart'].dirty &&
      !control.parent.controls['scriptureStart'].hasError('verseFormat') &&
      !control.parent.controls['scriptureStart'].hasError('verseRange') &&
      (control.parent.controls['scriptureStart'].invalid ||
        control.parent.hasError('verseDifferentBookOrChapter') ||
        control.parent.hasError('verseBeforeStart'))
    );

    return control.touched && (invalidCtrl || invalidStart);
  }
}
