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
import { combineVerseRefStrs } from '../../../shared/utils';
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
  @ViewChild(CheckingAudioCombinedComponent, { static: false }) audioCombinedComponent?: CheckingAudioCombinedComponent;
  @Input() project?: SFProject;
  @Input() projectUserConfigDoc?: SFProjectUserConfigDoc;
  @Input() projectText?: TextInfo;
  @Input() set questionDoc(questionDoc: QuestionDoc | undefined) {
    if (questionDoc !== this._questionDoc) {
      this.hideAnswerForm();
    }
    this._questionDoc = questionDoc;
    if (this.projectUserConfigDoc != null && this.projectUserConfigDoc.data != null) {
      this.userAnswerRefsRead = cloneDeep(this.projectUserConfigDoc.data.answerRefsRead);
    }
    // Validation is dependent on the chapter of the current question.
    this.updateValidationRules();
  }
  @Input() checkingTextComponent?: CheckingTextComponent;
  @Output() action: EventEmitter<AnswerAction> = new EventEmitter<AnswerAction>();
  @Output() commentAction: EventEmitter<CommentAction> = new EventEmitter<CommentAction>();

  activeAnswer?: Answer;
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

  private _questionDoc?: QuestionDoc;
  private userAnswerRefsRead: string[] = [];
  private audio: AudioAttachment = {};

  constructor(
    private readonly userService: UserService,
    private readonly dialog: MdcDialog,
    private readonly noticeService: NoticeService
  ) {
    super();
  }

  get answerText(): AbstractControl {
    return this.answerForm.controls.answerText;
  }

  get answers(): Answer[] {
    if (this._questionDoc == null || this._questionDoc.data == null) {
      return [];
    }
    if (this.canSeeOtherUserResponses || !this.canAddAnswer) {
      return this._questionDoc.data.answers;
    } else {
      return this._questionDoc.data.answers.filter(answer => answer.ownerRef === this.userService.currentUserId);
    }
  }

  get canSeeOtherUserResponses(): boolean {
    return this.project == null ? false : this.project.checkingConfig.usersSeeEachOthersResponses;
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
    if (this._questionDoc == null || this._questionDoc.data == null) {
      return 0;
    }
    return this._questionDoc.data.answers.filter(answer => answer.ownerRef === this.userService.currentUserId).length;
  }

  get hasUserRead(): boolean {
    return this.projectUserConfigDoc != null &&
      this.projectUserConfigDoc.data != null &&
      this._questionDoc != null &&
      this._questionDoc.data != null
      ? this.projectUserConfigDoc.data.questionRefsRead.includes(this._questionDoc.data.dataId)
      : false;
  }

  get canAddAnswer(): boolean {
    return SF_PROJECT_RIGHTS.hasRight(this.projectRole, {
      projectDomain: SFProjectDomain.Answers,
      operation: Operation.Create
    });
  }

  get questionDoc(): QuestionDoc | undefined {
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
    if (this.projectText != null && this._questionDoc != null && this._questionDoc.data != null) {
      const bookId = Canon.bookNumberToId(this.projectText.bookNum);
      const questionChapterNumber = this._questionDoc.data.verseRef.chapterNum;
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
    if (this.projectUserConfigDoc == null || this.projectUserConfigDoc.data == null) {
      return;
    }
    // update read answers list so when the answers are rendered again after editing they won't be shown as unread
    this.userAnswerRefsRead = cloneDeep(this.projectUserConfigDoc.data.answerRefsRead);
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
    if (this.checkingTextComponent == null) {
      return;
    }
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
    let currentVerseSelection: VerseRef | undefined;
    if (control.value != null) {
      const { verseRef } = VerseRef.tryParse(control.value);
      if (verseRef.valid) {
        currentVerseSelection = verseRef;
      }
    }

    let rangeStart: VerseRef | undefined;
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
      if (result != null && result !== 'close') {
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
    if (
      this.audio.status === 'recording' &&
      this.audioCombinedComponent != null &&
      this.audioCombinedComponent.audioRecorderComponent != null
    ) {
      await this.audioCombinedComponent.audioRecorderComponent.stopRecording();
      this.noticeService.show('The recording for your answer was automatically stopped.');
    }
    this.updateValidationRules();
    this.answerFormSubmitAttempted = true;
    if (this.answerForm.invalid) {
      return;
    }
    const userDoc = await this.userService.getCurrentUser();
    if (userDoc.data != null && !userDoc.data.isDisplayNameConfirmed) {
      await this.userService.editDisplayName(true);
    }
    this.emitAnswerToSave();
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
    const verseRef = this.getVerseRef();
    this.action.emit({
      action: 'save',
      text: this.answerText.value,
      answer: this.activeAnswer,
      audio: this.audio,
      scriptureText: this.scriptureText.value != null ? this.scriptureText.value : undefined,
      verseRef: verseRef == null ? undefined : fromVerseRef(verseRef)
    });
  }

  private updateValidationRules(): void {
    this.scriptureStart.setValidators([SFValidators.verseStr(this.textsByBookId)]);
    this.scriptureStart.updateValueAndValidity();
    this.scriptureEnd.setValidators([SFValidators.verseStr(this.textsByBookId)]);
    this.scriptureEnd.updateValueAndValidity();

    if (this.audio.url) {
      this.answerText.clearValidators();
    } else {
      this.answerText.setValidators(Validators.required);
    }
    this.answerText.updateValueAndValidity();
  }

  private getVerseRef(): VerseRef | undefined {
    return combineVerseRefStrs(this.scriptureStart.value, this.scriptureEnd.value);
  }
}
