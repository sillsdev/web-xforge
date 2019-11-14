import { MdcDialog } from '@angular-mdc/web/dialog';
import { Component, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { MediaObserver } from '@angular/flex-layout';
import { AbstractControl, FormControl, FormGroup, Validators } from '@angular/forms';
import { translate } from '@ngneat/transloco';
import cloneDeep from 'lodash/cloneDeep';
import { Operation } from 'realtime-server/lib/common/models/project-rights';
import { Answer } from 'realtime-server/lib/scriptureforge/models/answer';
import { SFProject } from 'realtime-server/lib/scriptureforge/models/sf-project';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from 'realtime-server/lib/scriptureforge/models/sf-project-rights';
import { SFProjectRole } from 'realtime-server/lib/scriptureforge/models/sf-project-role';
import { fromVerseRef, toVerseRef, VerseRefData } from 'realtime-server/lib/scriptureforge/models/verse-ref-data';
import { Canon } from 'realtime-server/lib/scriptureforge/scripture-utils/canon';
import { VerseRef } from 'realtime-server/lib/scriptureforge/scripture-utils/verse-ref';
import { Subscription } from 'rxjs';
import { NoticeService } from 'xforge-common/notice.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { UserService } from 'xforge-common/user.service';
import { QuestionDoc } from '../../../core/models/question-doc';
import { SFProjectUserConfigDoc } from '../../../core/models/sf-project-user-config-doc';
import { TextsByBookId } from '../../../core/models/texts-by-book-id';
import {
  TextChooserDialogComponent,
  TextChooserDialogData,
  TextSelection
} from '../../../text-chooser-dialog/text-chooser-dialog.component';
import { QuestionAnsweredDialogComponent } from '../../question-answered-dialog/question-answered-dialog.component';
import { QuestionDialogData } from '../../question-dialog/question-dialog.component';
import { QuestionDialogService } from '../../question-dialog/question-dialog.service';
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

enum LikeAnswerResponse {
  deniedOwnAnswer,
  deniedNonCommunityChecker,
  granted
}

/** The part of the checking area UI that handles user answer adding, editing, and displaying.
 * Note, the relevant specs are in checking.component.spec.ts.
 *
 * While the user is looking at answers to a question, other
 * users may be adding answers at the same time. These won't
 * just pop up, but will be stored until the user asks for
 * them or visits again. These are referred to here
 * as "remote" answers.*/
@Component({
  selector: 'app-checking-answers',
  templateUrl: './checking-answers.component.html',
  styleUrls: ['./checking-answers.component.scss']
})
export class CheckingAnswersComponent extends SubscriptionDisposable implements OnInit {
  @ViewChild(CheckingAudioCombinedComponent, { static: false }) audioCombinedComponent?: CheckingAudioCombinedComponent;
  @Input() project?: SFProject;
  @Input() projectId?: string;
  @Input() projectUserConfigDoc?: SFProjectUserConfigDoc;
  @Input() textsByBookId?: TextsByBookId;
  questionChangeSubscription?: Subscription = undefined;
  @Input() set questionDoc(questionDoc: QuestionDoc | undefined) {
    if (questionDoc !== this._questionDoc) {
      this.hideAnswerForm();
    }
    this._questionDoc = questionDoc;
    if (this.projectUserConfigDoc != null && this.projectUserConfigDoc.data != null) {
      this.userAnswerRefsRead = cloneDeep(this.projectUserConfigDoc.data.answerRefsRead);
    }

    this.showRemoteAnswers();
    if (questionDoc == null) {
      return;
    }
    if (this.questionChangeSubscription != null) {
      this.questionChangeSubscription!.unsubscribe();
    }
    this.questionChangeSubscription = this.subscribe(questionDoc.remoteChanges$, () => {
      // If the user hasn't added an answer yet and is able to, then
      // don't hold back any incoming answers from appearing right away
      // as soon as the user adds their answer.
      if (this.currentUserTotalAnswers === 0 && this.canAddAnswer) {
        this.showRemoteAnswers();
      }
    });
  }
  @Input() checkingTextComponent?: CheckingTextComponent;
  @Output() action: EventEmitter<AnswerAction> = new EventEmitter<AnswerAction>();
  @Output() commentAction: EventEmitter<CommentAction> = new EventEmitter<CommentAction>();

  /** Answer being edited. */
  activeAnswer?: Answer;
  answerForm = new FormGroup({
    answerText: new FormControl(),
    scriptureText: new FormControl()
  });
  answerFormVisible: boolean = false;
  answerFormSubmitAttempted: boolean = false;
  /** IDs of answers to show to user (so, excluding unshown incoming answers). */
  answersToShow: string[] = [];
  selectedText?: string;
  verseRef?: VerseRef;

  private _questionDoc?: QuestionDoc;
  private userAnswerRefsRead: string[] = [];
  private audio: AudioAttachment = {};

  constructor(
    private readonly userService: UserService,
    private readonly dialog: MdcDialog,
    private readonly noticeService: NoticeService,
    private readonly questionDialogService: QuestionDialogService,
    public media: MediaObserver
  ) {
    super();
  }

  get answerText(): AbstractControl {
    return this.answerForm.controls.answerText;
  }

  /** Answers to display, given contexts of permissions, whether the user has added their own answer yet, etc. */
  get answers(): Answer[] {
    if (this._questionDoc == null || this._questionDoc.data == null) {
      return [];
    }

    if (this.canSeeOtherUserResponses || !this.canAddAnswer) {
      return this._questionDoc.data.answers.filter(
        answer => answer.ownerRef === this.userService.currentUserId || this.answersToShow.includes(answer.dataId)
      );
    } else {
      return this._questionDoc.data.answers.filter(answer => answer.ownerRef === this.userService.currentUserId);
    }
  }

  get remoteAnswersCount(): number {
    return this.allAnswers.length - this.answers.length;
  }

  private get allAnswers(): Answer[] {
    if (this._questionDoc == null || this._questionDoc.data == null) {
      return [];
    }
    return this._questionDoc.data.answers;
  }

  get canSeeOtherUserResponses(): boolean {
    return this.project == null ? false : this.project.checkingConfig.usersSeeEachOthersResponses;
  }

  get canShowScriptureInput(): boolean {
    return !!this.selectedText;
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

  get isProjectAdmin(): boolean {
    return this.projectRole === SFProjectRole.ParatextAdministrator;
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

  get shouldReportAnswerCountInHeading(): boolean {
    return this.canSeeOtherUserResponses || !this.canAddAnswer;
  }

  get shouldShowAnswers(): boolean {
    return !this.answerFormVisible && this.totalAnswers > 0 && (this.currentUserTotalAnswers > 0 || !this.canAddAnswer);
  }

  get totalAnswers(): number {
    return this.allAnswers.length;
  }

  private get projectRole(): SFProjectRole {
    if (this.project == null) {
      return SFProjectRole.None;
    }
    return this.project.userRoles[this.userService.currentUserId] as SFProjectRole;
  }

  /** Fetch a TextsByBookId that only contains the book and chapter that pertains to the question. */
  private get currentBookAndChapter(): TextsByBookId {
    const textsByBook: TextsByBookId = {};
    if (this.textsByBookId != null && this._questionDoc != null && this._questionDoc.data != null) {
      const bookNum: number = this._questionDoc.data.verseRef.bookNum;
      const bookId = Canon.bookNumberToId(bookNum);
      const currentText = this.textsByBookId[bookId];
      const questionChapterNumber = this._questionDoc.data.verseRef.chapterNum;
      textsByBook[bookId] = cloneDeep(currentText);
      textsByBook[bookId].chapters = currentText.chapters.filter(chapter => chapter.number === questionChapterNumber);
    }
    return textsByBook;
  }

  ngOnInit(): void {
    this.applyTextAudioValidators();
  }

  clearSelection() {
    this.selectedText = '';
    this.verseRef = undefined;
  }

  archiveQuestion(): void {
    this._questionDoc!.submitJson0Op(op => {
      op.set<boolean>(qd => qd.isArchived, true);
      op.set(qd => qd.dateArchived!, new Date().toJSON());
    });
  }

  deleteAnswer(answer: Answer) {
    this.action.emit({
      action: 'delete',
      answer: answer
    });
    // All answers should show next time any do.
    this.showRemoteAnswers();
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
      this.verseRef = toVerseRef(this.activeAnswer.verseRef);
    }
    this.selectedText = this.activeAnswer.scriptureText;
    this.showAnswerForm();
  }

  async questionDialog(): Promise<void> {
    if (this._questionDoc == null || this._questionDoc.data == null) {
      return;
    }
    const projectId = this._questionDoc.data.projectRef;
    if (this._questionDoc.data.answers.length > 0) {
      const answeredDialogRef = this.dialog.open(QuestionAnsweredDialogComponent);
      const dialogResponse = (await answeredDialogRef.afterClosed().toPromise()) as string;
      if (dialogResponse === 'close') {
        return;
      }
    }

    const data: QuestionDialogData = {
      question: this._questionDoc.data,
      textsByBookId: this.textsByBookId!,
      projectId: projectId
    };
    await this.questionDialogService.questionDialog(data, this._questionDoc);
  }

  selectScripture() {
    const verseRef = this._questionDoc!.data!.verseRef;
    const dialogData: TextChooserDialogData = {
      bookNum: (this.verseRef && this.verseRef.bookNum) || verseRef.bookNum,
      chapterNum: (this.verseRef && this.verseRef.chapterNum) || verseRef.chapterNum,
      textsByBookId: this.textsByBookId!,
      projectId: this.projectId!,
      selectedText: this.selectedText || '',
      selectedVerses: this.verseRef
    };
    const dialogRef = this.dialog.open(TextChooserDialogComponent, { data: dialogData });
    dialogRef.afterClosed().subscribe(result => {
      if (result != null && result !== 'close') {
        const selection = result as TextSelection;
        this.verseRef = toVerseRef(selection.verses);
        this.selectedText = selection.text;
      }
    });
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
    this.clearSelection();
    this.audio = {};
    this.answerForm.reset();
    this.action.emit({
      action: 'hide-form'
    });
  }

  likeAnswer(answer: Answer) {
    const likeAnswerResponse: LikeAnswerResponse = this.canLikeAnswer(answer);
    if (likeAnswerResponse === LikeAnswerResponse.granted) {
      this.action.emit({
        action: 'like',
        answer: answer
      });
    } else if (likeAnswerResponse === LikeAnswerResponse.deniedOwnAnswer) {
      this.noticeService.show(translate('checking_answers.cannot_like_own_answer'));
    } else if (likeAnswerResponse === LikeAnswerResponse.deniedNonCommunityChecker) {
      this.noticeService.show(translate('checking_answers.only_community_checkers_can_like'));
    }
  }

  hasUserLikedAnswer(answer: Answer) {
    return answer.likes.some(like => like.ownerRef === this.userService.currentUserId);
  }

  processAudio(audio: AudioAttachment) {
    this.audio = audio;
    this.applyTextAudioValidators();
  }

  scriptureTextVerseRef(verse: VerseRef | VerseRefData): string {
    if (verse == null) {
      return '';
    }
    const verseRef = verse instanceof VerseRef ? verse : toVerseRef(verse);
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
      this.noticeService.show(translate('checking_answers.recording_automatically_stopped'));
    }
    this.applyTextAudioValidators();
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

  showRemoteAnswers() {
    if (this.questionDoc == null || this.questionDoc.data == null) {
      return;
    }
    this.answersToShow = this.questionDoc.data.answers.map(answer => answer.dataId);
  }

  private canLikeAnswer(answer: Answer): LikeAnswerResponse {
    let result: LikeAnswerResponse = LikeAnswerResponse.granted;
    if (this.userService.currentUserId === answer.ownerRef) {
      result = LikeAnswerResponse.deniedOwnAnswer;
    } else if (
      !(
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
      )
    ) {
      result = LikeAnswerResponse.deniedNonCommunityChecker;
    }
    return result;
  }

  private emitAnswerToSave() {
    this.action.emit({
      action: 'save',
      text: this.answerText.value,
      answer: this.activeAnswer,
      audio: this.audio,
      scriptureText: this.selectedText || undefined,
      verseRef: this.verseRef == null ? undefined : fromVerseRef(this.verseRef)
    });
  }

  private applyTextAudioValidators(): void {
    if (this.audio.url) {
      this.answerText.clearValidators();
    } else {
      this.answerText.setValidators(Validators.required);
    }
    this.answerText.updateValueAndValidity();
  }
}
