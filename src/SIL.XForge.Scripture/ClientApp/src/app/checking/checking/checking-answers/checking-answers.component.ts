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
import { VerseRef } from 'realtime-server/lib/scriptureforge/scripture-utils/verse-ref';
import { Subscription } from 'rxjs';
import { I18nService } from 'xforge-common/i18n.service';
import { FileType } from 'xforge-common/models/file-offline-data';
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
  action: 'delete' | 'save' | 'edit' | 'archive' | 'show-form' | 'hide-form' | 'like' | 'recorder' | 'show-unread';
  questionDoc?: QuestionDoc;
  answer?: Answer;
  text?: string;
  verseRef?: VerseRefData;
  scriptureText?: string;
  selectionStartClipped?: boolean;
  selectionEndClipped?: boolean;
  audio?: AudioAttachment;
  savedCallback?: () => void;
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
  @ViewChild(CheckingAudioCombinedComponent) audioCombinedComponent?: CheckingAudioCombinedComponent;
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
    this.updateQuestionAudioUrl();
    if (this.questionChangeSubscription != null) {
      this.questionChangeSubscription!.unsubscribe();
    }
    this.questionChangeSubscription = this.subscribe(questionDoc.remoteChanges$, ops => {
      this.updateQuestionAudioUrl();
      // If the user hasn't added an answer yet and is able to, then
      // don't hold back any incoming answers from appearing right away
      // as soon as the user adds their answer.
      if (this.currentUserTotalAnswers === 0 && this.canAddAnswer) {
        this.showRemoteAnswers();
        return;
      }
      // If any answers have been edited, identify which ones and highlight it
      for (const op of ops) {
        // 'oi' is an insert e.g. when replacing the dateModified on an answer
        // We're only interested when text is edited
        if (op['oi'] != null && op.p[0] === 'answers' && op.p[2] === 'text') {
          const answer = this.allAnswers[op.p[1]];
          if (this.answersHighlightStatus.has(answer.dataId)) {
            this.answersHighlightStatus.set(answer.dataId, false);
            setTimeout(() => this.answersHighlightStatus.set(answer.dataId, true));
          }
        }
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
  selectedText?: string;
  selectionStartClipped?: boolean;
  selectionEndClipped?: boolean;
  verseRef?: VerseRef;
  answersHighlightStatus: Map<string, boolean> = new Map<string, boolean>();
  questionUrl?: string;

  /** IDs of answers to show to user (so, excluding unshown incoming answers). */
  private _answersToShow: string[] = [];
  private _questionDoc?: QuestionDoc;
  private userAnswerRefsRead: string[] = [];
  private audio: AudioAttachment = {};
  /** If the user has recently added or edited their answer since opening up the question. */
  private justEditedAnswer: boolean = false;

  constructor(
    private readonly userService: UserService,
    private readonly dialog: MdcDialog,
    private readonly noticeService: NoticeService,
    private readonly questionDialogService: QuestionDialogService,
    private readonly i18n: I18nService,
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

    if (this.shouldSeeAnswersList) {
      return this._questionDoc.data.answers.filter(
        answer => answer.ownerRef === this.userService.currentUserId || this._answersToShow.includes(answer.dataId)
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

  /** Answer belonging to current user, if any. Assumes they don't have more than one answer. */
  get currentUserAnswer(): Answer | null {
    if (this._questionDoc == null || this._questionDoc.data == null) {
      return null;
    }
    const answer = this._questionDoc.data.answers.find(ans => ans.ownerRef === this.userService.currentUserId);
    return answer !== undefined ? answer : null;
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

  get shouldSeeAnswersList(): boolean {
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

  ngOnInit(): void {
    this.applyTextAudioValidators();
  }

  clearSelection() {
    this.selectedText = '';
    this.verseRef = undefined;
    this.selectionStartClipped = undefined;
    this.selectionEndClipped = undefined;
  }

  async archiveQuestion(): Promise<void> {
    await this._questionDoc!.submitJson0Op(op => {
      op.set<boolean>(qd => qd.isArchived, true);
      op.set(qd => qd.dateArchived!, new Date().toJSON());
    });
    this.action.emit({ action: 'archive' });
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
    this.justEditedAnswer = false;
    this.selectionStartClipped = this.activeAnswer.selectionStartClipped;
    this.selectionEndClipped = this.activeAnswer.selectionEndClipped;
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
      questionDoc: this._questionDoc,
      textsByBookId: this.textsByBookId!,
      projectId: projectId
    };
    const questionDialogResponse = await this.questionDialogService.questionDialog(data);
    if (questionDialogResponse != null && questionDialogResponse.data != null) {
      const blob = await questionDialogResponse.getFileContents(FileType.Audio, questionDialogResponse.data.dataId);
      this.questionUrl = blob != null ? URL.createObjectURL(blob) : undefined;
      this.action.emit({ action: 'edit', questionDoc: questionDialogResponse });
    }
  }

  async updateQuestionAudioUrl(): Promise<void> {
    if (this.questionDoc == null || this.questionDoc.data == null || this.questionDoc.data.audioUrl == null) {
      this.questionUrl = undefined;
      return;
    }
    const blob = await this.questionDoc.getFileContents(FileType.Audio, this.questionDoc.data.dataId);
    this.questionUrl = blob != null ? URL.createObjectURL(blob) : undefined;
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
        this.selectionStartClipped = selection.startClipped;
        this.selectionEndClipped = selection.endClipped;
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
    this.answerFormSubmitAttempted = false;
    this.activeAnswer = undefined;
    this.clearSelection();
    this.audio = {};
    this.answerForm.reset();
    if (this.answerFormVisible) {
      this.answerFormVisible = false;
      this.action.emit({ action: 'hide-form' });
    }
    this.refreshAnswersHighlightStatus();
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
    return `(${this.i18n.localizeReference(verseRef)})`;
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
  }

  /** If a given answer should have attention drawn to it in the UI. */
  shouldDrawAttentionToAnswer(answer: Answer): boolean {
    // If user added or edited their answer since navigating to this question, spotlight it and only it.
    if (this.justEditedAnswer === true) {
      return answer === this.currentUserAnswer;
    }

    // Spotlight any unread answers.
    return !this.hasUserReadAnswer(answer);
  }

  submitCommentAction(action: CommentAction) {
    this.commentAction.emit({
      action: action.action,
      comment: action.comment,
      answer: action.answer,
      text: action.text
    });
  }

  showRemoteAnswers(showUnreadClicked?: boolean) {
    if (this.questionDoc == null || this.questionDoc.data == null) {
      return;
    }
    this._answersToShow = this.questionDoc.data.answers.map(answer => answer.dataId);
    this.refreshAnswersHighlightStatus();
    this.justEditedAnswer = false;
    if (showUnreadClicked) {
      this.action.emit({ action: 'show-unread' });
    }
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

  private refreshAnswersHighlightStatus(): void {
    this.answersHighlightStatus.clear();
    setTimeout(() => {
      for (const answer of this.answers) {
        this.answersHighlightStatus.set(answer.dataId, this.shouldDrawAttentionToAnswer(answer));
      }
    });
  }

  private emitAnswerToSave() {
    this.action.emit({
      action: 'save',
      text: this.answerText.value,
      answer: this.activeAnswer,
      audio: this.audio,
      scriptureText: this.selectedText || undefined,
      selectionStartClipped: this.selectionStartClipped,
      selectionEndClipped: this.selectionEndClipped,
      verseRef: this.verseRef == null ? undefined : fromVerseRef(this.verseRef),
      savedCallback: () => {
        this.hideAnswerForm();
        this.justEditedAnswer = true;
      }
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
