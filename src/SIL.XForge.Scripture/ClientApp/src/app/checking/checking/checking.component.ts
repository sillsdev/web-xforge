import { MdcList, MdcMenuSelectedEvent } from '@angular-mdc/web';
import { Component, ElementRef, HostBinding, OnInit, ViewChild } from '@angular/core';
import { MediaChange, MediaObserver } from '@angular/flex-layout';
import { ActivatedRoute } from '@angular/router';
import { SplitComponent } from 'angular-split';
import cloneDeep from 'lodash/cloneDeep';
import { Answer } from 'realtime-server/lib/scriptureforge/models/answer';
import { Comment } from 'realtime-server/lib/scriptureforge/models/comment';
import { Question } from 'realtime-server/lib/scriptureforge/models/question';
import { SFProjectRole } from 'realtime-server/lib/scriptureforge/models/sf-project-role';
import { TextInfo } from 'realtime-server/lib/scriptureforge/models/text-info';
import { Subscription } from 'rxjs';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { NoticeService } from 'xforge-common/notice.service';
import { UserService } from 'xforge-common/user.service';
import { objectId } from 'xforge-common/utils';
import { HelpHeroService } from '../../core/help-hero.service';
import { CommentListDoc } from '../../core/models/comment-list-doc';
import { QuestionListDoc } from '../../core/models/question-list-doc';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { SFProjectUserConfigDoc } from '../../core/models/sf-project-user-config-doc';
import { getTextDocIdStr, TextDocId } from '../../core/models/text-doc-id';
import { SFProjectService } from '../../core/sf-project.service';
import { CheckingUtils } from '../checking.utils';
import { AnswerAction, CheckingAnswersComponent } from './checking-answers/checking-answers.component';
import { CommentAction } from './checking-answers/checking-comments/checking-comments.component';
import { CheckingQuestionsComponent } from './checking-questions/checking-questions.component';
import { CheckingTextComponent } from './checking-text/checking-text.component';

interface Summary {
  unread: number;
  read: number;
  answered: number;
}

interface CheckingData {
  questionListDocs: { [docId: string]: QuestionListDoc };
  commentListDocs: { [docId: string]: CommentListDoc };
  realtimeSubscriptions: { [docId: string]: Subscription[] };
}

@Component({
  selector: 'app-checking',
  templateUrl: './checking.component.html',
  styleUrls: ['./checking.component.scss']
})
export class CheckingComponent extends DataLoadingComponent implements OnInit {
  @ViewChild('answerPanelContainer') set answersPanelElement(answersPanelContainerElement: ElementRef) {
    // Need to trigger the calculation for the slider after DOM has been updated
    this.answersPanelContainerElement = answersPanelContainerElement;
    this.calculateScriptureSliderPosition(true);
  }

  @HostBinding('class') classes = 'flex-max';
  @ViewChild(CheckingAnswersComponent) answersPanel: CheckingAnswersComponent;
  @ViewChild(CheckingTextComponent) scripturePanel: CheckingTextComponent;
  @ViewChild(CheckingQuestionsComponent) questionsPanel: CheckingQuestionsComponent;
  @ViewChild(SplitComponent) splitComponent: SplitComponent;
  @ViewChild('splitContainer') splitContainerElement: ElementRef;
  @ViewChild('scripturePanelContainer') scripturePanelContainerElement: ElementRef;
  @ViewChild('chapterMenuList') chapterMenuList: MdcList;

  chapters: number[] = [];
  checkingData: CheckingData = { questionListDocs: {}, commentListDocs: {}, realtimeSubscriptions: {} };
  comments: Readonly<Comment[]> = [];
  isExpanded: boolean = false;
  publicQuestions: Readonly<Question[]> = [];
  resetAnswerPanelHeightOnFormHide: boolean = false;
  summary: Summary = {
    read: 0,
    unread: 0,
    answered: 0
  };

  answersPanelContainerElement: ElementRef;
  projectDoc: SFProjectDoc;
  projectUserConfigDoc: SFProjectUserConfigDoc;
  text: TextInfo;
  textDocId: TextDocId;

  private _isDrawerPermanent: boolean = true;
  private _chapter: number;
  private _questions: Readonly<Question[]> = [];

  constructor(
    private readonly activatedRoute: ActivatedRoute,
    private readonly projectService: SFProjectService,
    private readonly userService: UserService,
    private readonly helpHeroService: HelpHeroService,
    private readonly media: MediaObserver,
    noticeService: NoticeService
  ) {
    super(noticeService);
  }

  get chapter(): number {
    return this._chapter;
  }

  set chapter(value: number) {
    if (this._chapter !== value) {
      this._chapter = value;
      this.textDocId = new TextDocId(this.projectDoc.id, this.text.bookId, this.chapter, 'target');
    }
  }

  get chapterStrings(): string[] {
    return this.chapters.map(c => c.toString());
  }

  get isDrawerPermanent(): boolean {
    return this._isDrawerPermanent;
  }

  set isDrawerPermanent(value: boolean) {
    if (this._isDrawerPermanent !== value) {
      this._isDrawerPermanent = value;
      if (!this._isDrawerPermanent) {
        this.collapseDrawer();
      }
    }
  }

  private get answerPanelElementHeight(): number {
    return this.answersPanelContainerElement ? this.answersPanelContainerElement.nativeElement.offsetHeight : 0;
  }

  private get answerPanelElementMinimumHeight(): number {
    return this.answerPanelElementHeight
      ? this.answerPanelElementHeight -
          this.answersPanelContainerElement.nativeElement.querySelector('.answers-container').offsetHeight +
          20
      : 0;
  }

  private get questionTextJsonDocId(): string {
    return getTextDocIdStr(this.projectDoc.id, this.text.bookId, this.questionsPanel.activeQuestionChapter);
  }

  private get activeQuestionIndex(): number {
    return this.checkingData.questionListDocs[this.questionTextJsonDocId].data.questions.findIndex(
      question => question.id === this.questionsPanel.activeQuestion.id
    );
  }

  private get minAnswerPanelHeight(): number {
    // Add 1 extra percentage to allow for gutter (slider toggle) height eating in to calculated space requested
    return Math.ceil((this.answerPanelElementMinimumHeight / this.splitContainerElementHeight) * 100) + 1;
  }
  private get maxAnswerPanelHeight(): number {
    // Add 1 extra percentage to allow for gutter (slider toggle) height eating in to calculated space requested
    return Math.ceil((this.answerPanelElementHeight / this.splitContainerElementHeight) * 100) + 1;
  }

  private get splitContainerElementHeight(): number {
    return this.splitContainerElement ? this.splitContainerElement.nativeElement.offsetHeight : 0;
  }

  ngOnInit(): void {
    this.subscribe(this.activatedRoute.params, async params => {
      this.loadingStarted();
      const projectId = params['projectId'];
      const bookId = params['bookId'];
      const prevProjectId = this.projectDoc == null ? '' : this.projectDoc.id;
      const prevBookId = this.text == null ? '' : this.text.bookId;
      this.projectDoc = await this.projectService.get(projectId);
      if (!this.projectDoc.isLoaded) {
        return;
      }
      this.text = this.projectDoc.data.texts.find(t => t.bookId === bookId);
      this.projectUserConfigDoc = await this.projectService.getUserConfig(projectId, this.userService.currentUserId);
      this.chapters = this.text.chapters.map(c => c.number);
      if (prevProjectId !== this.projectDoc.id || prevBookId !== this.text.bookId) {
        const bindCheckingDataPromises: Promise<void>[] = [];
        for (const chapter of this.chapters) {
          bindCheckingDataPromises.push(
            this.bindCheckingData(new TextDocId(this.projectDoc.id, this.text.bookId, chapter))
          );
        }
        // Trigger the chapter setter to bind the relevant comments.
        await Promise.all(bindCheckingDataPromises);
        this._chapter = undefined;
        this.chapter = 1;
        this.refreshQuestions();
        this.refreshComments();

        this.startUserOnboardingTour(); // start HelpHero tour for the Community Checking feature
        this.loadingFinished();
      }
      // Subscribe to the projectDoc now that it is defined
      this.subscribe(this.projectDoc.remoteChanges$, () => {
        if (!(this.userService.currentUserId in this.projectDoc.data.userRoles)) {
          this.onRemovedFromProject();
        }
      });
      this.subscribe(this.projectDoc.delete$, () => this.onRemovedFromProject());
    });
    this.subscribe(this.media.media$, (change: MediaChange) => {
      this.calculateScriptureSliderPosition();
      this.isDrawerPermanent = ['xl', 'lt-xl', 'lg', 'lt-lg', 'md', 'lt-md'].includes(change.mqAlias);
    });
  }

  applyFontChange(fontSize: string) {
    this.scripturePanel.applyFontChange(fontSize);
  }

  async answerAction(answerAction: AnswerAction) {
    let useMaxAnswersPanelSize: boolean = true;
    switch (answerAction.action) {
      case 'save':
        let answer: Answer = answerAction.answer;
        const dateNow: string = new Date().toJSON();
        if (!answer) {
          answer = {
            id: objectId(),
            ownerRef: this.userService.currentUserId,
            text: '',
            likes: [],
            dateCreated: dateNow,
            dateModified: dateNow
          };
        }
        answer.text = answerAction.text;
        answer.scriptureText = answerAction.scriptureText;
        answer.scriptureStart = answerAction.scriptureStart;
        answer.scriptureEnd = answerAction.scriptureEnd;
        answer.dateModified = dateNow;
        if (answerAction.audio.fileName) {
          const response = await this.projectService.onlineUploadAudio(
            this.projectDoc.id,
            answer.id,
            new File([answerAction.audio.blob], answerAction.audio.fileName)
          );
          // Get the amended filename and save it against the answer
          answer.audioUrl = response;
        } else if (answerAction.audio.status === 'reset') {
          answer.audioUrl = undefined;
        }
        this.saveAnswer(answer);
        break;
      case 'delete':
        this.deleteAnswer(answerAction.answer);
        break;
      case 'like':
        this.likeAnswer(answerAction.answer);
        break;
      case 'show-form':
        this.resetAnswerPanelHeightOnFormHide = true;
        break;
      case 'hide-form':
        useMaxAnswersPanelSize = false;
        break;
    }
    this.calculateScriptureSliderPosition(useMaxAnswersPanelSize);
  }

  collapseDrawer() {
    this.isExpanded = false;
  }

  openDrawer() {
    this.isExpanded = true;
  }

  toggleDrawer() {
    this.isExpanded = !this.isExpanded;
  }

  drawerCollapsed(): void {
    this.isExpanded = false;
  }

  chapterMenuOpened() {
    // Focus is lost when the menu closes so need to set it again
    // Need to wait for DOM to update as we can't set the focus until it is visible and no built in method
    setTimeout(() => {
      this.chapterMenuList.focusItemAtIndex(this.chapter - 1);
    }, 10);
  }

  commentAction(commentAction: CommentAction) {
    let useMaxAnswersPanelSize: boolean = true;
    switch (commentAction.action) {
      case 'save':
        let comment: Comment = commentAction.comment;
        const dateNow: string = new Date().toJSON();
        if (!comment) {
          comment = {
            id: objectId(),
            ownerRef: this.userService.currentUserId,
            answerRef: commentAction.answer.id,
            text: '',
            dateCreated: dateNow,
            dateModified: dateNow
          };
        }
        comment.text = commentAction.text;
        comment.dateModified = dateNow;
        this.saveComment(comment);
        break;
      case 'show-comments':
        this.projectUserConfigDoc.submitJson0Op(op => {
          for (const comm of this.comments) {
            if (!this.questionsPanel.hasUserReadComment(comm)) {
              op.add(puc => puc.commentRefsRead, comm.id);
            }
          }
        });
        break;
      case 'delete':
        this.deleteComment(commentAction.comment);
        break;
      case 'show-form':
        this.resetAnswerPanelHeightOnFormHide = true;
        break;
      case 'hide-form':
        useMaxAnswersPanelSize = false;
        break;
    }
    this.calculateScriptureSliderPosition(useMaxAnswersPanelSize);
  }

  checkSliderPosition(event: any) {
    if (event.hasOwnProperty('sizes')) {
      if (event.sizes[1] < this.minAnswerPanelHeight) {
        this.calculateScriptureSliderPosition();
      }
    }
  }

  onChapterSelect(event: MdcMenuSelectedEvent) {
    const chapter = parseInt(event.source.value, 10);
    if (this.chapter !== chapter) {
      this.chapter = chapter;
    }
  }

  questionUpdated(question: Question) {
    this.refreshSummary();
  }

  questionChanged(question: Question) {
    if (this.questionsPanel.activeQuestionChapter !== this.chapter) {
      this.chapter = this.questionsPanel.activeQuestionChapter;
    }
    this.calculateScriptureSliderPosition(true);
    this.refreshSummary();
    this.collapseDrawer();
  }

  totalQuestions(): number {
    return this.publicQuestions.length;
  }

  private getAnswerIndex(answer: Answer): number {
    return this.questionsPanel.activeQuestion.answers.findIndex(existingAnswer => existingAnswer.id === answer.id);
  }

  private getCommentIndex(comment: Comment): number {
    const commentsInDoc = this.checkingData.commentListDocs[this.questionTextJsonDocId].data.comments;
    return commentsInDoc.findIndex(existingComment => existingComment.id === comment.id);
  }

  private deleteAnswer(answer: Answer): void {
    const answerIndex = this.getAnswerIndex(answer);
    if (answerIndex >= 0) {
      this.checkingData.questionListDocs[this.questionTextJsonDocId]
        .submitJson0Op(op => op.remove(ql => ql.questions[this.activeQuestionIndex].answers, answerIndex))
        .then(() => this.projectService.onlineDeleteAudio(this.projectDoc.id, answer.id, answer.ownerRef));
      this.refreshSummary();
    }
  }

  private saveAnswer(answer: Answer): void {
    const answers = cloneDeep(this.questionsPanel.activeQuestion.answers);
    const answerIndex = this.getAnswerIndex(answer);
    if (answerIndex >= 0) {
      answers[answerIndex] = answer;
    } else {
      answers.unshift(answer);
    }
    this.updateQuestionAnswers(answers, answerIndex);
  }

  private updateQuestionAnswers(answers: Answer[], answerIndex: number): void {
    const questionWithAnswer: Question = cloneDeep(this.questionsPanel.activeQuestion);
    questionWithAnswer.answers = answers;
    if (answerIndex >= 0) {
      const oldAnswer = this.checkingData.questionListDocs[this.questionTextJsonDocId].data.questions[
        this.activeQuestionIndex
      ].answers[answerIndex];
      const newAnswer = questionWithAnswer.answers[answerIndex];
      const deleteAudio = oldAnswer.audioUrl != null && newAnswer.audioUrl == null;
      const submitPromise = this.checkingData.questionListDocs[this.questionTextJsonDocId].submitJson0Op(op =>
        op
          .set(ql => ql.questions[this.activeQuestionIndex].answers[answerIndex].text, newAnswer.text)
          .set(ql => ql.questions[this.activeQuestionIndex].answers[answerIndex].scriptureText, newAnswer.scriptureText)
          .set(
            ql => ql.questions[this.activeQuestionIndex].answers[answerIndex].scriptureStart,
            newAnswer.scriptureStart
          )
          .set(ql => ql.questions[this.activeQuestionIndex].answers[answerIndex].scriptureEnd, newAnswer.scriptureEnd)
          .set(ql => ql.questions[this.activeQuestionIndex].answers[answerIndex].audioUrl, newAnswer.audioUrl)
          .set(ql => ql.questions[this.activeQuestionIndex].answers[answerIndex].dateModified, newAnswer.dateModified)
      );
      if (deleteAudio) {
        submitPromise.then(() =>
          this.projectService.onlineDeleteAudio(this.projectDoc.id, oldAnswer.id, oldAnswer.ownerRef)
        );
      }
    } else {
      this.checkingData.questionListDocs[this.questionTextJsonDocId].submitJson0Op(op =>
        op.insert(ql => ql.questions[this.activeQuestionIndex].answers, 0, questionWithAnswer.answers[0])
      );
    }
    this.questionsPanel.updateElementsRead(this.questionsPanel.activeQuestion);
  }

  private saveComment(comment: Comment): void {
    const commentIndex = this.getCommentIndex(comment);
    if (commentIndex >= 0) {
      this.checkingData.commentListDocs[this.questionTextJsonDocId].submitJson0Op(op =>
        op
          .set(cl => cl.comments[commentIndex].text, comment.text)
          .set(cl => cl.comments[commentIndex].dateModified, comment.dateModified)
      );
    } else {
      this.checkingData.commentListDocs[this.questionTextJsonDocId].submitJson0Op(op =>
        op.insert(cl => cl.comments, 0, comment)
      );
    }
    this.refreshComments();
  }

  private deleteComment(comment: Comment): void {
    const commentIndex = this.getCommentIndex(comment);
    if (commentIndex >= 0) {
      this.checkingData.commentListDocs[this.questionTextJsonDocId].submitJson0Op(op =>
        op.remove(cl => cl.comments, commentIndex)
      );
    }
    this.refreshComments();
  }

  private refreshQuestions() {
    this._questions = [];
    for (const chapter of this.chapters) {
      this._questions = this._questions.concat(
        this.checkingData.questionListDocs[getTextDocIdStr(this.projectDoc.id, this.text.bookId, chapter)].data
          .questions
      );
    }
    this.publicQuestions = this._questions.filter(q => q.isArchived !== true);
  }

  private refreshComments() {
    this.comments = [];
    for (const chapter of this.chapters) {
      this.comments = this.comments.concat(
        this.checkingData.commentListDocs[getTextDocIdStr(this.projectDoc.id, this.text.bookId, chapter)].data.comments
      );
    }
  }

  private likeAnswer(answer: Answer) {
    const currentUserId = this.userService.currentUserId;
    const likeIndex = answer.likes.findIndex(like => like.ownerRef === currentUserId);
    const answerIndex = this.getAnswerIndex(answer);

    if (likeIndex >= 0) {
      this.checkingData.questionListDocs[this.questionTextJsonDocId].submitJson0Op(op =>
        op.remove(ql => ql.questions[this.activeQuestionIndex].answers[answerIndex].likes, likeIndex)
      );
    } else {
      this.checkingData.questionListDocs[this.questionTextJsonDocId].submitJson0Op(op =>
        op.insert(ql => ql.questions[this.activeQuestionIndex].answers[answerIndex].likes, 0, {
          ownerRef: currentUserId
        })
      );
    }
  }

  private calculateScriptureSliderPosition(maximizeAnswerPanel: boolean = false): void {
    // Wait while Angular updates visible DOM elements before we can calculate the height correctly
    setTimeout((): void => {
      let answerPanelHeight: number;
      if (maximizeAnswerPanel) {
        answerPanelHeight = this.maxAnswerPanelHeight;
      } else if (this.resetAnswerPanelHeightOnFormHide) {
        // Default the answers panel size to 50% so the scripture panel shows after answers and comments are added
        answerPanelHeight = this.maxAnswerPanelHeight < 50 ? this.maxAnswerPanelHeight : 50;
        this.resetAnswerPanelHeightOnFormHide = false;
      } else {
        answerPanelHeight = this.minAnswerPanelHeight;
      }
      if (answerPanelHeight > 100) {
        answerPanelHeight = 100;
      }
      const scripturePanelHeight = 100 - answerPanelHeight;
      this.splitComponent.setVisibleAreaSizes([scripturePanelHeight, answerPanelHeight]);
    }, 100);
  }

  // Unbind this component from the data when a user is removed from the project, otherwise console
  // errors appear before the app can navigate to the start component
  private onRemovedFromProject() {
    this.questionsPanel.activeQuestion = null;
    this.publicQuestions = [];
    this.comments = [];
    this.projectUserConfigDoc = null;
    for (const chapter of this.chapters) {
      this.unbindCheckingData(new TextDocId(this.projectDoc.id, this.text.bookId, chapter));
    }
    this.projectDoc = null;
    this.text = null;
  }

  private async bindCheckingData(id: TextDocId): Promise<void> {
    if (id == null) {
      return;
    }

    this.unbindCheckingData(id);
    this.checkingData.questionListDocs[id.toString()] = await this.projectService.getQuestionList(id);
    this.checkingData.commentListDocs[id.toString()] = await this.projectService.getCommentList(id);
    this.checkingData.realtimeSubscriptions[id.toString()] = [
      this.checkingData.questionListDocs[id.toString()].remoteChanges$.subscribe(() => this.refreshQuestions()),
      this.checkingData.commentListDocs[id.toString()].remoteChanges$.subscribe(() => this.refreshComments())
    ];
  }

  private unbindCheckingData(id: TextDocId): void {
    if (!(id.toString() in this.checkingData.questionListDocs)) {
      return;
    }

    for (const sub of this.checkingData.realtimeSubscriptions[id.toString()]) {
      sub.unsubscribe();
    }
    delete this.checkingData.questionListDocs[id.toString()];
    delete this.checkingData.commentListDocs[id.toString()];
  }

  private refreshSummary() {
    this.summary.answered = 0;
    this.summary.read = 0;
    this.summary.unread = 0;
    for (const question of this.publicQuestions) {
      if (CheckingUtils.hasUserAnswered(question, this.userService.currentUserId)) {
        this.summary.answered++;
      } else if (CheckingUtils.hasUserReadQuestion(question, this.projectUserConfigDoc.data)) {
        this.summary.read++;
      } else {
        this.summary.unread++;
      }
    }
  }

  private startUserOnboardingTour() {
    // HelpHero user-onboarding tour setup
    const isProjectAdmin: boolean =
      this.projectDoc.data.userRoles[this.userService.currentUserId] === SFProjectRole.ParatextAdministrator;
    const isDiscussionEnabled: boolean = this.projectDoc.data.usersSeeEachOthersResponses;
    const isInvitingEnabled: boolean = this.projectDoc.data.shareEnabled;

    this.helpHeroService.setProperty({
      isAdmin: isProjectAdmin,
      isDiscussionEnabled,
      isInvitingEnabled
    });
  }
}
