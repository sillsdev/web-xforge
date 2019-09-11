import { ErrorStateMatcher, MdcDialog, MdcDialogConfig, MdcDialogRef } from '@angular-mdc/web';
import { Component, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  FormGroupDirective,
  NgForm,
  ValidationErrors,
  Validators
} from '@angular/forms';
import cloneDeep from 'lodash/cloneDeep';
import { Answer } from 'realtime-server/lib/scriptureforge/models/answer';
import { SFProject } from 'realtime-server/lib/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/scriptureforge/models/sf-project-role';
import { TextInfo } from 'realtime-server/lib/scriptureforge/models/text-info';
import {
  fromVerseRef,
  toStartAndEndVerseRefs,
  toVerseRef,
  VerseRefData
} from 'realtime-server/lib/scriptureforge/models/verse-ref-data';
import { Canon } from 'realtime-server/lib/scriptureforge/scripture-utils/canon';
import { VerseRef } from 'realtime-server/lib/scriptureforge/scripture-utils/verse-ref';
import { AccountService } from 'xforge-common/account.service';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { UserService } from 'xforge-common/user.service';
import { QuestionDoc } from '../../../core/models/question-doc';
import { SFProjectUserConfigDoc } from '../../../core/models/sf-project-user-config-doc';
import { TextsByBookId } from '../../../core/models/texts-by-book-id';
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
  verseRef?: VerseRefData;
  scriptureText?: string;
  audio?: AudioAttachment;
}

@Component({
  selector: 'app-checking-answers',
  templateUrl: './checking-answers.component.html',
  styleUrls: ['./checking-answers.component.scss']
})
export class CheckingAnswersComponent implements OnInit {
  @ViewChild(CheckingAudioCombinedComponent, { static: false }) audioCombinedComponent: CheckingAudioCombinedComponent;
  @Input() project: SFProject;
  @Input() projectUserConfigDoc: SFProjectUserConfigDoc;
  @Input() projectText: TextInfo;
  @Input() set questionDoc(questionDoc: QuestionDoc) {
    if (questionDoc !== this._questionDoc) {
      this.hideAnswerForm();
    }
    this._questionDoc = questionDoc;
    this.userAnswerRefsRead = cloneDeep(this.projectUserConfigDoc.data.answerRefsRead);
  }
  @Input() checkingTextComponent: CheckingTextComponent;
  @Output() action: EventEmitter<AnswerAction> = new EventEmitter<AnswerAction>();
  @Output() commentAction: EventEmitter<CommentAction> = new EventEmitter<CommentAction>();

  activeAnswer: Answer;
  answerForm = new FormGroup(
    {
      answerText: new FormControl(),
      scriptureStart: new FormControl(),
      scriptureEnd: new FormControl(),
      scriptureText: new FormControl()
    },
    SFValidators.verseStartBeforeEnd
  );
  answerFormVisible: boolean = false;
  answerFormSubmitAttempted: boolean = false;
  parentAndStartMatcher = new ParentAndStartErrorStateMatcher();

  private user: UserDoc;
  private _questionDoc: QuestionDoc;
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
    if (this._questionDoc == null || !this._questionDoc.isLoaded) {
      return [];
    }
    if (this.canSeeOtherUserResponses || this.isAdministrator) {
      return this._questionDoc.data.answers;
    } else {
      return this._questionDoc.data.answers.filter(answer => answer.ownerRef === this.userService.currentUserId);
    }
  }

  get canSeeOtherUserResponses(): boolean {
    return this.project.checkingConfig.usersSeeEachOthersResponses;
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
    if (this._questionDoc == null || !this._questionDoc.isLoaded) {
      return 0;
    }
    return this._questionDoc.data.answers.filter(answer => answer.ownerRef === this.userService.currentUserId).length;
  }

  get hasUserRead(): boolean {
    return this.projectUserConfigDoc != null &&
      this.projectUserConfigDoc.isLoaded &&
      this.projectUserConfigDoc.data.questionRefsRead
      ? this.projectUserConfigDoc.data.questionRefsRead.includes(this.questionDoc.data.dataId)
      : false;
  }

  get isAdministrator(): boolean {
    if (this.project == null || this.projectUserConfigDoc == null || !this.projectUserConfigDoc.isLoaded) {
      return false;
    }
    return this.project.userRoles[this.projectUserConfigDoc.data.ownerRef] === SFProjectRole.ParatextAdministrator;
  }

  get questionDoc(): QuestionDoc {
    return this._questionDoc;
  }

  get scriptureStart(): AbstractControl {
    return this.answerForm.controls.scriptureStart;
  }

  get scriptureEnd(): AbstractControl {
    return this.answerForm.controls.scriptureEnd;
  }
  get scriptureText(): AbstractControl {
    return this.answerForm.controls.scriptureText;
  }

  get totalAnswersHeading(): string {
    if (this.canSeeOtherUserResponses || this.isAdministrator) {
      return this.answers.length + ' Answers';
    } else {
      return 'Your Answer';
    }
  }

  private get textsByBookId(): TextsByBookId {
    const textsByBook: TextsByBookId = {};
    if (this.projectText) {
      textsByBook[Canon.bookNumberToId(this.projectText.bookNum)] = this.projectText;
    }
    return textsByBook;
  }

  ngOnInit(): void {
    this.userService.getCurrentUser().then(u => (this.user = u));
    this.scriptureStart.setValidators([SFValidators.verseStr(this.textsByBookId)]);
    this.scriptureStart.updateValueAndValidity();
    this.scriptureEnd.setValidators([SFValidators.verseStr(this.textsByBookId)]);
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
    if (this.activeAnswer.verseRef != null) {
      const { startVerseRef, endVerseRef } = toStartAndEndVerseRefs(this.activeAnswer.verseRef);
      this.scriptureStart.setValue(startVerseRef.toString());
      if (endVerseRef != null) {
        this.scriptureEnd.setValue(endVerseRef.toString());
      }
    }
    this.scriptureText.setValue(this.activeAnswer.scriptureText);
    this.showAnswerForm();
  }

  extractScriptureText() {
    const verseRef = this.getVerseRef();
    const verses = [];
    if (verseRef != null) {
      for (const verseInRange of verseRef.allVerses()) {
        verses.push(
          this.checkingTextComponent.textComponent.getSegmentText(`verse_${verseInRange.chapter}_${verseInRange.verse}`)
        );
      }
    }
    this.scriptureText.setValue(verses.length ? verses.join(' ') : null);
  }

  updateScriptureEndEnabled() {
    this.scriptureStart.valid ? this.scriptureEnd.enable() : this.scriptureEnd.disable();
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
      this.userAnswerRefsRead.includes(answer.dataId) || this.projectUserConfigDoc.data.ownerRef === answer.ownerRef
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
    let currentVerseSelection: VerseRef;
    if (control.value != null) {
      const { verseRef } = VerseRef.tryParse(control.value);
      if (verseRef.valid) {
        currentVerseSelection = verseRef;
      }
    }

    let rangeStart: VerseRef;
    if (control !== this.scriptureStart && this.scriptureStart.value != null) {
      const { verseRef } = VerseRef.tryParse(this.scriptureStart.value);
      if (verseRef.valid) {
        rangeStart = verseRef;
      }
    }

    const dialogConfig: MdcDialogConfig<ScriptureChooserDialogData> = {
      data: { input: currentVerseSelection, booksAndChaptersToShow: this.textsByBookId, rangeStart }
    };

    const dialogRef = this.dialog.open(ScriptureChooserDialogComponent, dialogConfig) as MdcDialogRef<
      ScriptureChooserDialogComponent,
      VerseRef | 'close'
    >;
    dialogRef.afterClosed().subscribe(result => {
      if (result !== 'close') {
        control.setValue(result.toString());
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
    if (answer.verseRef == null) {
      return '';
    }
    const verseRef = toVerseRef(answer.verseRef);
    return `(${verseRef.toString()})`;
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
      verseRef: fromVerseRef(this.getVerseRef())
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

  private getVerseRef(): VerseRef {
    let verseRefStr = this.scriptureStart.value;
    if (!verseRefStr) {
      return undefined;
    }
    if (this.scriptureEnd.value && verseRefStr !== this.scriptureEnd.value) {
      const scriptureEnd = VerseRef.parse(this.scriptureEnd.value);
      verseRefStr += `-${scriptureEnd.verse}`;
    }

    const { verseRef } = VerseRef.tryParse(verseRefStr);
    return verseRef.valid ? verseRef : undefined;
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
