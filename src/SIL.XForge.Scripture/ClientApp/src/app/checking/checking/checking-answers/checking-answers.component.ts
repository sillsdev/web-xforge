import { ErrorStateMatcher, MdcDialog, MdcDialogConfig } from '@angular-mdc/web';
import { Component, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, FormGroupDirective, NgForm, Validators } from '@angular/forms';
import cloneDeep from 'lodash/cloneDeep';
import { Answer } from 'realtime-server/lib/scriptureforge/models/answer';
import { Comment } from 'realtime-server/lib/scriptureforge/models/comment';
import { Question } from 'realtime-server/lib/scriptureforge/models/question';
import { SFProject } from 'realtime-server/lib/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/scriptureforge/models/sf-project-role';
import { TextInfo, TextsByBook } from 'realtime-server/lib/scriptureforge/models/text-info';
import { VerseRefData } from 'realtime-server/lib/scriptureforge/models/verse-ref-data';
import { AccountService } from 'xforge-common/account.service';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { UserService } from 'xforge-common/user.service';
import { SFProjectUserConfigDoc } from '../../../core/models/sf-project-user-config-doc';
import {
  ScriptureChooserDialogComponent,
  ScriptureChooserDialogData
} from '../../../scripture-chooser-dialog/scripture-chooser-dialog.component';
import { ScrVers } from '../../../shared/scripture-utils/scr-vers';
import { VerseRef } from '../../../shared/scripture-utils/verse-ref';
import {
  verseRefDataToString,
  verseRefToVerseRefData
} from '../../../shared/scripture-utils/verse-ref-data-converters';
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
  @ViewChild(CheckingAudioCombinedComponent) audioCombinedComponent: CheckingAudioCombinedComponent;
  @Input() project: SFProject;
  @Input() projectUserConfigDoc: SFProjectUserConfigDoc;
  @Input() projectText: TextInfo;
  @Input() set question(question: Question) {
    if (question !== this._question) {
      this.hideAnswerForm();
    }
    this._question = question;
    this.userAnswerRefsRead = cloneDeep(this.projectUserConfigDoc.data.answerRefsRead);
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
  private userAnswerRefsRead: string[] = [];
  private audio: AudioAttachment = {};

  constructor(
    private accountService: AccountService,
    private userService: UserService,
    readonly dialog: MdcDialog,
    private noticeService: NoticeService
  ) {}

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
    if (this.project == null || this.projectUserConfigDoc == null || !this.projectUserConfigDoc.isLoaded) {
      return false;
    }
    return this.project.userRoles[this.projectUserConfigDoc.data.ownerRef] === SFProjectRole.ParatextAdministrator;
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
    this.scriptureStart.setValue(verseRefDataToString(this.activeAnswer.scriptureStart));
    this.scriptureEnd.setValue(verseRefDataToString(this.activeAnswer.scriptureEnd));
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

  updateScriptureEndEnabled() {
    this.scriptureStart.valid ? this.scriptureEnd.enable() : this.scriptureEnd.disable();
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
    return this.userAnswerRefsRead.includes(answer.id) || this.projectUserConfigDoc.data.ownerRef === answer.ownerRef;
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
    const currentVerseSelection = verseRefToVerseRefData(VerseRef.fromStr(control.value, ScrVers.English));

    let rangeStart: VerseRefData;
    if (control !== this.scriptureStart) {
      rangeStart = verseRefToVerseRefData(VerseRef.fromStr(this.scriptureStart.value, ScrVers.English));
    }

    const dialogConfig: MdcDialogConfig<ScriptureChooserDialogData> = {
      data: { input: currentVerseSelection, booksAndChaptersToShow: this.textsByBook, rangeStart }
    };

    const dialogRef = this.dialog.open(ScriptureChooserDialogComponent, dialogConfig);
    dialogRef.afterClosed().subscribe((result: VerseRefData) => {
      if (result !== 'close') {
        control.setValue(verseRefDataToString(result));
        control.markAsTouched();
        control.markAsDirty();
        this.extractScriptureText();
        this.updateScriptureEndEnabled();
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
    let scriptureRef = verseRefDataToString(answer.scriptureStart);
    if (answer.scriptureEnd != null && answer.scriptureStart.verse !== answer.scriptureEnd.verse) {
      scriptureRef += `-${answer.scriptureEnd.verse}`;
    }
    return `(${scriptureRef})`;
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
      this.noticeService.show('The recording for your answer was automatically stopped.');
    }
    this.setValidationRules();
    this.answerFormSubmitAttempted = true;
    if (this.answerForm.invalid) {
      return;
    }
    if (this.user.data.isDisplayNameConfirmed) {
      this.emitAnswerToSave();
      this.hideAnswerForm();
      return;
    }
    const dialogRef = this.accountService.openNameDialog(this.user.data.displayName, true);
    dialogRef.afterClosed().subscribe(async response => {
      await this.user.submitJson0Op(op => {
        op.set(u => u.displayName, response as string);
        op.set<boolean>(u => u.isDisplayNameConfirmed, true);
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
    if (this.activeAnswer) {
      // If editing an answer, ensure answers read is current
      this.userAnswerRefsRead = cloneDeep(this.projectUserConfigDoc.data.answerRefsRead);
    }
    this.action.emit({
      action: 'save',
      text: this.answerText.value,
      answer: this.activeAnswer,
      audio: this.audio,
      scriptureText: this.scriptureText.value != null ? this.scriptureText.value : undefined,
      scriptureStart: verseRefToVerseRefData(this.scriptureStartVerseRef),
      scriptureEnd: verseRefToVerseRefData(this.scriptureEndVerseRef)
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
