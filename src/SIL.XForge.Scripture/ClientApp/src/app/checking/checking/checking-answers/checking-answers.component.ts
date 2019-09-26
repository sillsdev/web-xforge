import { MdcDialog, MdcDialogConfig, MdcDialogRef } from '@angular-mdc/web';
import { Component, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, Validators } from '@angular/forms';
import cloneDeep from 'lodash/cloneDeep';
import { Operation } from 'realtime-server/lib/common/models/project-rights';
import { Answer } from 'realtime-server/lib/scriptureforge/models/answer';
import { SFProject } from 'realtime-server/lib/scriptureforge/models/sf-project';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from 'realtime-server/lib/scriptureforge/models/sf-project-rights';
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
import { NoticeService } from 'xforge-common/notice.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { UserService } from 'xforge-common/user.service';
import { QuestionDoc } from '../../../core/models/question-doc';
import { SFProjectUserConfigDoc } from '../../../core/models/sf-project-user-config-doc';
import { TextsByBookId } from '../../../core/models/texts-by-book-id';
import {
  ScriptureChooserDialogComponent,
  ScriptureChooserDialogData
} from '../../../scripture-chooser-dialog/scripture-chooser-dialog.component';
import {
  ParentAndStartErrorStateMatcher,
  SFValidators,
  StartReferenceRequiredErrorStateMatcher
} from '../../../shared/sfvalidators';
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

/** The part of the checking area UI that handles user answer receiving, editing, and displaying.
 * Note, the relevant specs are in checking.component.spec.ts. */
@Component({
  selector: 'app-checking-answers',
  templateUrl: './checking-answers.component.html',
  styleUrls: ['./checking-answers.component.scss']
})
export class CheckingAnswersComponent extends SubscriptionDisposable implements OnInit {
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
    // Validation is dependent on the chapter of the current question.
    this.updateValidationRules();
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
    [SFValidators.verseStartBeforeEnd, SFValidators.requireIfEndReferenceProvided]
  );
  answerFormVisible: boolean = false;
  answerFormSubmitAttempted: boolean = false;
  parentAndStartMatcher = new ParentAndStartErrorStateMatcher();
  startReferenceMatcher = new StartReferenceRequiredErrorStateMatcher();

  private _questionDoc: QuestionDoc;
  private userAnswerRefsRead: string[] = [];
  private audio: AudioAttachment = {};

  constructor(
    private accountService: AccountService,
    private userService: UserService,
    readonly dialog: MdcDialog,
    private noticeService: NoticeService
  ) {
    super();
  }

  get answerText(): AbstractControl {
    return this.answerForm.controls.answerText;
  }

  get answers(): Answer[] {
    if (this._questionDoc == null || !this._questionDoc.isLoaded) {
      return [];
    }
    if (this.canSeeOtherUserResponses || !this.canAddAnswer) {
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

  get canAddAnswer(): boolean {
    return SF_PROJECT_RIGHTS.hasRight(this.projectRole, {
      projectDomain: SFProjectDomain.Answers,
      operation: Operation.Create
    });
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

  get hasScriptureReferenceError(): boolean {
    return (
      this.scriptureStart.invalid ||
      this.scriptureEnd.invalid ||
      this.answerForm.hasError('verseBeforeStart') ||
      this.answerForm.hasError('verseDifferentBookOrChapter') ||
      this.answerForm.hasError('startReferenceRequired')
    );
  }

  get totalAnswersHeading(): string {
    if (this.canSeeOtherUserResponses || !this.canAddAnswer) {
      return this.answers.length + ' Answers';
    } else {
      return 'Your Answer';
    }
  }

  private get projectRole(): SFProjectRole {
    if (this.project == null) {
      return SFProjectRole.None;
    }
    return this.project.userRoles[this.userService.currentUserId] as SFProjectRole;
  }

  /** Fetch a TextsByBookId that only contains the book and chapter that pertains to the question. */
  private get textsByBookId(): TextsByBookId {
    const textsByBook: TextsByBookId = {};
    if (this.projectText) {
      const bookId = Canon.bookNumberToId(this.projectText.bookNum);
      const questionChapterNumber = this.questionDoc.data.verseRef.chapterNum;
      textsByBook[bookId] = cloneDeep(this.projectText);
      textsByBook[bookId].chapters = this.projectText.chapters.filter(
        chapter => chapter.number === questionChapterNumber
      );
    }
    return textsByBook;
  }

  ngOnInit(): void {
    this.updateValidationRules();
    this.subscribe(this.scriptureStart.valueChanges, () => {
      if (this.scriptureStart.valid) {
        this.extractScriptureText();
      } else {
        this.scriptureText.reset();
      }
      // update enabled/disabled state for scriptureEnd
      this.updateScriptureEndEnabled();
    });
    this.subscribe(this.scriptureEnd.valueChanges, () => {
      if (this.scriptureEnd.valid) {
        this.extractScriptureText();
      }
    });
    this.updateScriptureEndEnabled();
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
    this.scriptureStart.value && this.scriptureStart.valid ? this.scriptureEnd.enable() : this.scriptureEnd.disable();
  }

  canEditAnswer(answer: Answer): boolean {
    return SF_PROJECT_RIGHTS.hasRight(
      this.projectRole,
      { projectDomain: SFProjectDomain.Answers, operation: Operation.Edit },
      this.userService.currentUserId,
      answer
    );
  }

  canDeleteAnswer(answer: Answer): boolean {
    return SF_PROJECT_RIGHTS.hasRight(
      this.projectRole,
      { projectDomain: SFProjectDomain.Answers, operation: Operation.Delete },
      this.userService.currentUserId,
      answer
    );
  }

  hasUserReadAnswer(answer: Answer): boolean {
    return this.userAnswerRefsRead.includes(answer.dataId) || this.userService.currentUserId === answer.ownerRef;
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
    if (this.canLikeAnswer(answer)) {
      this.action.emit({
        action: 'like',
        answer: answer
      });
    }
  }

  hasUserLikedAnswer(answer: Answer) {
    return answer.likes.some(like => like.ownerRef === this.userService.currentUserId);
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
    this.updateValidationRules();
    this.answerFormSubmitAttempted = true;
    if (this.answerForm.invalid) {
      return;
    }
    const userDoc = await this.userService.getCurrentUser();
    if (userDoc.data.isDisplayNameConfirmed) {
      this.emitAnswerToSave();
      this.hideAnswerForm();
      return;
    }
    const dialogRef = this.accountService.openNameDialog(userDoc.data.displayName, true);
    dialogRef.afterClosed().subscribe(async response => {
      await userDoc.submitJson0Op(op => {
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

  private canLikeAnswer(answer: Answer): boolean {
    return (
      this.userService.currentUserId !== answer.ownerRef &&
      SF_PROJECT_RIGHTS.hasRight(
        this.projectRole,
        { projectDomain: SFProjectDomain.Answers, operation: Operation.DeleteOwn },
        this.userService.currentUserId,
        answer
      ) &&
      SF_PROJECT_RIGHTS.hasRight(this.projectRole, {
        projectDomain: SFProjectDomain.Answers,
        operation: Operation.Create
      })
    );
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

  private updateValidationRules(): void {
    this.scriptureStart.setValidators([SFValidators.verseStr(this.textsByBookId)]);
    this.scriptureStart.updateValueAndValidity();
    this.scriptureEnd.setValidators([SFValidators.verseStr(this.textsByBookId)]);
    this.scriptureEnd.updateValueAndValidity();

    if (this.audio.url) {
      this.answerForm.get('answerText').clearValidators();
    } else {
      this.answerForm.get('answerText').setValidators(Validators.required);
    }
    this.answerForm.get('answerText').updateValueAndValidity();
  }

  private getVerseRef(): VerseRef {
    let verseRefStr = this.scriptureStart.value as string;
    if (!verseRefStr) {
      return undefined;
    }

    let scriptureEnd: { success: boolean; verseRef: VerseRef };
    const verseRefEndStr = this.scriptureEnd.value as string;
    if (verseRefEndStr && verseRefStr.toLowerCase() !== verseRefEndStr.toLowerCase()) {
      scriptureEnd = VerseRef.tryParse(this.scriptureEnd.value);
      if (scriptureEnd.verseRef.valid) {
        verseRefStr += `-${scriptureEnd.verseRef.verse}`;
      }
    }

    const { verseRef } = VerseRef.tryParse(verseRefStr);
    return verseRef.valid ? verseRef : undefined;
  }
}
