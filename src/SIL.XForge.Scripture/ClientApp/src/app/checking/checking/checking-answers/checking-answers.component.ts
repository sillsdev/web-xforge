import {
  Component,
  DestroyRef,
  EventEmitter,
  Input,
  OnInit,
  Output,
  QueryList,
  ViewChild,
  ViewChildren
} from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { VerseRef } from '@sillsdev/scripture';
import { cloneDeep } from 'lodash-es';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { Answer, AnswerStatus } from 'realtime-server/lib/esm/scriptureforge/models/answer';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { toVerseRef, VerseRefData } from 'realtime-server/lib/esm/scriptureforge/models/verse-ref-data';
import { firstValueFrom, Subscription } from 'rxjs';
import { DialogService } from 'xforge-common/dialog.service';
import { FileService } from 'xforge-common/file.service';
import { I18nService } from 'xforge-common/i18n.service';
import { FileType } from 'xforge-common/models/file-offline-data';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { UserService } from 'xforge-common/user.service';
import { quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { QuestionDoc } from '../../../core/models/question-doc';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { SFProjectUserConfigDoc } from '../../../core/models/sf-project-user-config-doc';
import { TextsByBookId } from '../../../core/models/texts-by-book-id';
import { SFProjectService } from '../../../core/sf-project.service';
import {
  AudioRecorderDialogComponent,
  AudioRecorderDialogData,
  AudioRecorderDialogResult
} from '../../../shared/audio-recorder-dialog/audio-recorder-dialog.component';
import { CheckingUtils } from '../../checking.utils';
import { QuestionDialogData } from '../../question-dialog/question-dialog.component';
import { QuestionDialogService } from '../../question-dialog/question-dialog.service';
import { AudioAttachment } from '../checking-audio-player/checking-audio-player.component';
import { CheckingTextComponent } from '../checking-text/checking-text.component';
import { CheckingCommentsComponent, CommentAction } from './checking-comments/checking-comments.component';
import { CheckingInput, CheckingInputFormComponent } from './checking-input-form/checking-input-form.component';
import { CheckingQuestionComponent } from './checking-question/checking-question.component';

export interface AnswerAction {
  action:
    | 'delete'
    | 'save'
    | 'edit'
    | 'archive'
    | 'show-form'
    | 'hide-form'
    | 'like'
    | 'recorder'
    | 'show-unread'
    | 'status'
    | 'play-audio';
  questionDoc?: QuestionDoc;
  answer?: Answer;
  text?: string;
  verseRef?: VerseRefData;
  scriptureText?: string;
  selectionStartClipped?: boolean;
  selectionEndClipped?: boolean;
  audio?: AudioAttachment;
  status?: AnswerStatus;
  savedCallback?: () => void;
}

enum LikeAnswerResponse {
  DeniedOwnAnswer,
  DeniedNoPermission,
  Granted
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
export class CheckingAnswersComponent implements OnInit {
  @ViewChild(CheckingInputFormComponent) answerInput?: CheckingInputFormComponent;
  @ViewChildren(CheckingCommentsComponent) allComments?: QueryList<CheckingCommentsComponent>;
  @ViewChild(CheckingQuestionComponent) questionComponent?: CheckingQuestionComponent;
  @Input() projectUserConfigDoc?: SFProjectUserConfigDoc;
  @Input() textsByBookId?: TextsByBookId;
  @Input() checkingTextComponent?: CheckingTextComponent;
  @Output() action: EventEmitter<AnswerAction> = new EventEmitter<AnswerAction>();
  @Output() commentAction: EventEmitter<CommentAction> = new EventEmitter<CommentAction>();

  questionChangeSubscription?: Subscription = undefined;
  /** Answer being edited. */
  activeAnswer?: Answer;
  answerFormVisible: boolean = false;
  selectedText?: string;
  selectionStartClipped?: boolean;
  selectionEndClipped?: boolean;
  verseRef?: VerseRef;
  answersHighlightStatus: Map<string, boolean> = new Map<string, boolean>();
  submittingAnswer: boolean = false;

  /** IDs of answers to show to user (so, excluding unshown incoming answers). */
  private _answersToShow: string[] = [];
  private _projectProfileDoc?: SFProjectProfileDoc;
  private _questionDoc?: QuestionDoc;
  private userAnswerRefsRead: string[] = [];
  private fileSources: Map<string, string | undefined> = new Map<string, string | undefined>();
  /** If the user has recently added or edited their answer since opening up the question. */
  private justEditedAnswer: boolean = false;
  private isProjectAdmin: boolean = false;
  private projectProfileDocChangesSubscription?: Subscription;
  isScreenSmall: boolean = false;

  constructor(
    private readonly userService: UserService,
    private readonly dialogService: DialogService,
    private readonly noticeService: NoticeService,
    private readonly questionDialogService: QuestionDialogService,
    private readonly i18n: I18nService,
    private readonly fileService: FileService,
    private readonly onlineStatusService: OnlineStatusService,
    private readonly projectService: SFProjectService,
    private destroyRef: DestroyRef
  ) {}

  get project(): SFProjectProfile | undefined {
    return this._projectProfileDoc?.data;
  }
  get projectId(): string | undefined {
    return this._projectProfileDoc?.id;
  }

  @Input() set projectProfileDoc(projectProfileDoc: SFProjectProfileDoc | undefined) {
    this.projectProfileDocChangesSubscription?.unsubscribe();
    this._projectProfileDoc = projectProfileDoc;
    if (projectProfileDoc == null) {
      return;
    }
    this.projectProfileDocChangesSubscription = projectProfileDoc.changes$
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.setProjectAdmin();
      });
    this.setProjectAdmin();
  }

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
    this.updateQuestionDocAudioUrls();
    if (this.questionChangeSubscription != null) {
      this.questionChangeSubscription!.unsubscribe();
    }
    this.questionChangeSubscription = questionDoc.remoteChanges$
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(ops => {
        this.updateQuestionDocAudioUrls();
        // If the user hasn't added an answer yet and is able to, then
        // don't hold back any incoming answers from appearing right away
        // as soon as the user adds their answer.
        if (this.currentUserTotalAnswers === 0 && this.canAddAnswer && !this.isProjectAdmin) {
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
  get questionDoc(): QuestionDoc | undefined {
    return this._questionDoc;
  }

  /** Answers to display, given contexts of permissions, whether the user has added their own answer yet, etc. */
  get answers(): Answer[] {
    if (this._questionDoc == null || this._questionDoc.data == null) {
      return [];
    }

    if (this.shouldSeeAnswersList) {
      return this._questionDoc.data.answers.filter(
        answer =>
          (answer.ownerRef === this.userService.currentUserId || this._answersToShow.includes(answer.dataId)) &&
          !answer.deleted
      );
    } else {
      return this._questionDoc.getAnswers(this.userService.currentUserId);
    }
  }

  get remoteAnswersCount(): number {
    return this.allAnswers.length - this.answers.length;
  }

  private get allAnswers(): Answer[] {
    if (this._questionDoc == null || this._questionDoc.data == null) {
      return [];
    }
    return this._questionDoc.getAnswers();
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
    return this._questionDoc.getAnswers(this.userService.currentUserId).length;
  }

  /** Answer belonging to current user, if any. Assumes they don't have more than one answer. */
  get currentUserAnswer(): Answer | null {
    if (this._questionDoc == null || this._questionDoc.data == null) {
      return null;
    }
    const answer = this._questionDoc.data.answers.find(
      answer => answer.ownerRef === this.userService.currentUserId && !answer.deleted
    );
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

  get canEditQuestion(): boolean {
    const userId = this.userService.currentUserId;
    const data = this.questionDoc?.data;
    return (
      this.project != null &&
      SF_PROJECT_RIGHTS.hasRight(this.project, userId, SFProjectDomain.Questions, Operation.Edit, data)
    );
  }

  get canAddAnswer(): boolean {
    const userId = this.userService.currentUserId;
    return (
      this.project != null &&
      SF_PROJECT_RIGHTS.hasRight(this.project, userId, SFProjectDomain.Answers, Operation.Create)
    );
  }

  get shouldSeeAnswersList(): boolean {
    return this.canSeeOtherUserResponses || !this.canAddAnswer || this.isProjectAdmin;
  }

  get shouldShowAnswers(): boolean {
    return (
      !this.answerFormVisible &&
      this.totalAnswers > 0 &&
      (this.currentUserTotalAnswers > 0 || !this.canAddAnswer || this.isProjectAdmin)
    );
  }

  get totalAnswers(): number {
    return this.allAnswers.length;
  }

  ngOnInit(): void {
    this.fileService.fileSyncComplete$
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.updateQuestionDocAudioUrls());
  }

  async archiveQuestion(): Promise<void> {
    await this._questionDoc!.submitJson0Op(op => {
      op.set<boolean>(qd => qd.isArchived, true);
      op.set(qd => qd.dateArchived!, new Date().toJSON());
    });
    this.action.emit({ action: 'archive' });
  }

  async deleteAnswerClicked(answer: Answer): Promise<void> {
    const confirmation = await this.dialogService.confirm('checking_answers.confirm_delete', 'checking_answers.delete');
    if (!confirmation) return;

    this.action.emit({
      action: 'delete',
      answer
    });
    // All answers should show next time any do.
    this.showRemoteAnswers();
  }

  editAnswer(answer: Answer): void {
    if (this.projectUserConfigDoc == null || this.projectUserConfigDoc.data == null) {
      return;
    }
    // update read answers list so when the answers are rendered again after editing they won't be shown as unread
    this.userAnswerRefsRead = cloneDeep(this.projectUserConfigDoc.data.answerRefsRead);
    this.activeAnswer = cloneDeep(answer);
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
    if (this._questionDoc?.data == null || this._projectProfileDoc == null) {
      return;
    }
    const projectId = this._questionDoc.data.projectRef;
    if (this._questionDoc?.data != null && this._questionDoc.getAnswers().length > 0) {
      const confirm = await this.dialogService.confirm(
        'question_answered_dialog.question_has_answer',
        'question_answered_dialog.edit_anyway'
      );
      if (!confirm) {
        return;
      }
    }

    this.questionComponent?.stopAudio();

    const data: QuestionDialogData = {
      questionDoc: this._questionDoc,
      projectDoc: this._projectProfileDoc,
      textsByBookId: this.textsByBookId!,
      projectId,
      isRightToLeft: this.project?.isRightToLeft
    };
    const dialogResponseDoc: QuestionDoc | undefined = await this.questionDialogService.questionDialog(data);
    if (dialogResponseDoc?.data != null) {
      this.updateQuestionDocAudioUrls();
      this.action.emit({ action: 'edit', questionDoc: dialogResponseDoc });
    }
  }

  getFileSource(url: string | undefined): string | undefined {
    if (url != null && url !== '' && this.fileSources.has(url)) {
      return this.fileSources.get(url);
    }
    return undefined;
  }

  /** Opens the audio recorder dialog and saves the recorded audio for the current question. */
  async recordDialog(): Promise<void> {
    if (this.questionDoc?.data == null) return;
    const dialogRef: MatDialogRef<AudioRecorderDialogComponent, AudioRecorderDialogResult> =
      this.dialogService.openMatDialog(AudioRecorderDialogComponent, {
        data: { countdown: true, requireSave: true } as AudioRecorderDialogData
      });

    const result: AudioRecorderDialogResult | undefined = await firstValueFrom(dialogRef.afterClosed());
    if (result?.audio.fileName != null && result.audio.blob != null) {
      const urlResult: string | undefined = await this.questionDoc.uploadFile(
        FileType.Audio,
        this.questionDoc.data.dataId,
        result.audio.blob,
        result.audio.fileName
      );
      if (urlResult != null) {
        this.questionDoc.submitJson0Op(op => op.set(q => q.audioUrl, urlResult));
      }
    }
  }

  canChangeAnswerStatus(answer: Answer): boolean {
    const userId = this.userService.currentUserId;
    return (
      this.project != null &&
      SF_PROJECT_RIGHTS.hasRight(this.project, userId, SFProjectDomain.AnswerStatus, Operation.Edit, answer)
    );
  }

  canEditAnswer(answer: Answer): boolean {
    const userId = this.userService.currentUserId;
    return (
      this.project != null &&
      SF_PROJECT_RIGHTS.hasRight(this.project, userId, SFProjectDomain.Answers, Operation.Edit, answer)
    );
  }

  canDeleteAnswer(answer: Answer): boolean {
    const userId = this.userService.currentUserId;
    return (
      this.project != null &&
      SF_PROJECT_RIGHTS.hasRight(this.project, userId, SFProjectDomain.Answers, Operation.Delete, answer)
    );
  }

  hasUserReadAnswer(answer: Answer): boolean {
    return this.userAnswerRefsRead.includes(answer.dataId) || this.userService.currentUserId === answer.ownerRef;
  }

  hideAnswerForm(): void {
    this.activeAnswer = undefined;
    if (this.answerFormVisible) {
      this.answerFormVisible = false;
      this.action.emit({ action: 'hide-form' });
    }
    this.refreshAnswersHighlightStatus();
  }

  isMarkedForExport(answer: Answer): boolean {
    return answer.status === AnswerStatus.Exportable;
  }

  isAnswerResolved(answer: Answer): boolean {
    return answer.status === AnswerStatus.Resolved;
  }

  likeAnswer(answer: Answer): void {
    const likeAnswerResponse: LikeAnswerResponse = this.canLikeAnswer(answer);
    if (likeAnswerResponse === LikeAnswerResponse.Granted) {
      this.action.emit({
        action: 'like',
        answer
      });
    } else if (likeAnswerResponse === LikeAnswerResponse.DeniedOwnAnswer) {
      this.noticeService.show(this.i18n.translateStatic('checking_answers.cannot_like_own_answer'));
    } else if (likeAnswerResponse === LikeAnswerResponse.DeniedNoPermission) {
      this.noticeService.show(this.i18n.translateStatic('checking_answers.no_permission_to_like'));
    }
  }

  markAnswerForExport(answer: Answer): void {
    this.toggleAnswerStatus(answer, AnswerStatus.Exportable);
  }

  markAnswerAsResolved(answer: Answer): void {
    this.toggleAnswerStatus(answer, AnswerStatus.Resolved);
  }

  hasUserLikedAnswer(answer: Answer): boolean {
    return answer.likes.some(like => like.ownerRef === this.userService.currentUserId);
  }

  scriptureTextVerseRef(verseRef: VerseRefData | VerseRef | undefined): string {
    return CheckingUtils.scriptureTextVerseRef(verseRef, this.i18n);
  }

  showAnswerForm(): void {
    this.answerFormVisible = true;
    this.action.emit({
      action: 'show-form'
    });
  }

  playAudio(): void {
    this.action.emit({ action: 'play-audio' });
  }

  async submit(response: CheckingInput): Promise<void> {
    this.submittingAnswer = true;
    const userDoc = await this.userService.getCurrentUser();
    if (this.onlineStatusService.isOnline && userDoc.data?.isDisplayNameConfirmed !== true) {
      await this.userService.editDisplayName(true);
    }
    this.emitAnswerToSave(response);
  }

  /** If a given answer should have attention drawn to it in the UI. */
  shouldDrawAttentionToAnswer(answer: Answer): boolean {
    // If user added or edited their answer since navigating to this question, spotlight it and only it.
    if (this.justEditedAnswer) {
      return answer === this.currentUserAnswer;
    }

    // Spotlight any unread answers.
    return !this.hasUserReadAnswer(answer);
  }

  submitCommentAction(action: CommentAction): void {
    this.commentAction.emit({
      action: action.action,
      comment: action.comment,
      answer: action.answer,
      text: action.text,
      audio: action.audio
    });
  }

  showRemoteAnswers(showUnreadClicked?: boolean): void {
    if (this.questionDoc == null || this.questionDoc.data == null) {
      return;
    }
    this._answersToShow = this.questionDoc.getAnswers().map(answer => answer.dataId);
    this.refreshAnswersHighlightStatus();
    this.justEditedAnswer = false;
    if (showUnreadClicked) {
      this.action.emit({ action: 'show-unread' });
    }
  }

  private canLikeAnswer(answer: Answer): LikeAnswerResponse {
    const userId = this.userService.currentUserId;
    let result: LikeAnswerResponse = LikeAnswerResponse.Granted;
    if (userId === answer.ownerRef) {
      result = LikeAnswerResponse.DeniedOwnAnswer;
    } else if (
      this.project == null ||
      !SF_PROJECT_RIGHTS.hasRight(this.project, userId, SFProjectDomain.Likes, Operation.Create)
    ) {
      result = LikeAnswerResponse.DeniedNoPermission;
    }
    return result;
  }

  private async updateQuestionDocAudioUrls(): Promise<void> {
    this.fileSources.clear();
    if (this.questionDoc?.data == null) {
      return;
    }
    this.cacheFileSource(this.questionDoc, this.questionDoc.data.dataId, this.questionDoc.data.audioUrl);
    for (const answer of this.questionDoc.getAnswers()) {
      this.cacheFileSource(this.questionDoc, answer.dataId, answer.audioUrl);
    }
  }

  private async cacheFileSource(questionDoc: QuestionDoc, dataId: string, audioUrl: string | undefined): Promise<void> {
    const audio: Blob | undefined = await questionDoc.getFileContents(FileType.Audio, dataId);
    if (audioUrl == null) {
      return;
    }
    // Always use the cached audio file if available otherwise set as undefined i.e. not available
    // We record the original audioUrl so that checks can be made by the player to see if the file is available
    // off the server when the cache is not available i.e. an 404 error is returned
    const source: string | undefined = audio != null ? URL.createObjectURL(audio) : undefined;
    this.fileSources.set(audioUrl, source);
  }

  private refreshAnswersHighlightStatus(): void {
    this.answersHighlightStatus.clear();
    setTimeout(() => {
      for (const answer of this.answers) {
        this.answersHighlightStatus.set(answer.dataId, this.shouldDrawAttentionToAnswer(answer));
      }
    });
  }

  private emitAnswerToSave(response: CheckingInput): void {
    this.action.emit({
      action: 'save',
      text: response.text,
      answer: this.activeAnswer,
      audio: response.audio,
      scriptureText: response.selectedText,
      selectionStartClipped: response.selectionStartClipped,
      selectionEndClipped: response.selectionEndClipped,
      verseRef: response.verseRef == null ? undefined : response.verseRef,
      questionDoc: this.questionDoc,
      savedCallback: () => {
        this.hideAnswerForm();
        this.submittingAnswer = false;
        this.justEditedAnswer = true;
        this.updateQuestionDocAudioUrls();
      }
    });
  }

  private setProjectAdmin(): void {
    if (this.projectId == null) {
      return;
    }
    this.projectService.isProjectAdmin(this.projectId, this.userService.currentUserId).then(isProjectAdmin => {
      this.isProjectAdmin = isProjectAdmin;
    });
  }

  private toggleAnswerStatus(answer: Answer, status: AnswerStatus): void {
    const newAnswer = cloneDeep(answer);
    newAnswer.status = answer.status !== status ? status : AnswerStatus.None;
    this.action.emit({
      action: 'status',
      answer: newAnswer,
      questionDoc: this.questionDoc
    });
  }
}
