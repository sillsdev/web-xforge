import { MdcList, MdcMenuSelectedEvent } from '@angular-mdc/web';
import { Component, ElementRef, HostBinding, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { MediaChange, MediaObserver } from '@angular/flex-layout';
import { ActivatedRoute } from '@angular/router';
import { SplitComponent } from 'angular-split';
import cloneDeep from 'lodash/cloneDeep';
import { Answer } from 'realtime-server/lib/scriptureforge/models/answer';
import { Comment } from 'realtime-server/lib/scriptureforge/models/comment';
import { Question } from 'realtime-server/lib/scriptureforge/models/question';
import { SFProjectRole } from 'realtime-server/lib/scriptureforge/models/sf-project-role';
import { TextInfo } from 'realtime-server/lib/scriptureforge/models/text-info';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { NoticeService } from 'xforge-common/notice.service';
import { UserService } from 'xforge-common/user.service';
import { objectId } from 'xforge-common/utils';
import { HelpHeroService } from '../../core/help-hero.service';
import { QuestionDoc } from '../../core/models/question-doc';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { SFProjectUserConfigDoc } from '../../core/models/sf-project-user-config-doc';
import { TextDocId } from '../../core/models/text-doc';
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

@Component({
  selector: 'app-checking',
  templateUrl: './checking.component.html',
  styleUrls: ['./checking.component.scss']
})
export class CheckingComponent extends DataLoadingComponent implements OnInit, OnDestroy {
  @ViewChild('answerPanelContainer', { static: false }) set answersPanelElement(
    answersPanelContainerElement: ElementRef
  ) {
    // Need to trigger the calculation for the slider after DOM has been updated
    this.answersPanelContainerElement = answersPanelContainerElement;
    this.calculateScriptureSliderPosition(true);
  }

  @HostBinding('class') classes = 'flex-max';
  @ViewChild(CheckingAnswersComponent, { static: false }) answersPanel: CheckingAnswersComponent;
  @ViewChild(CheckingTextComponent, { static: true }) scripturePanel: CheckingTextComponent;
  @ViewChild(CheckingQuestionsComponent, { static: true }) questionsPanel: CheckingQuestionsComponent;
  @ViewChild(SplitComponent, { static: true }) splitComponent: SplitComponent;
  @ViewChild('splitContainer', { static: true }) splitContainerElement: ElementRef;
  @ViewChild('scripturePanelContainer', { static: true }) scripturePanelContainerElement: ElementRef;
  @ViewChild('chapterMenuList', { static: true }) chapterMenuList: MdcList;

  chapters: number[] = [];
  isExpanded: boolean = false;
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
  private questionsQuery: RealtimeQuery<QuestionDoc>;

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

  get questionDocs(): Readonly<QuestionDoc[]> {
    return this.questionsQuery != null ? this.questionsQuery.docs : [];
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
        if (this.questionsQuery != null) {
          this.questionsQuery.dispose();
        }
        this.questionsQuery = await this.projectService.getQuestions(projectId, {
          bookId: this.text.bookId,
          activeOnly: true,
          sort: true
        });
        this._chapter = undefined;
        this.chapter = 1;

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

  ngOnDestroy(): void {
    if (this.questionsQuery != null) {
      this.questionsQuery.dispose();
    }
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
            dataId: objectId(),
            ownerRef: this.userService.currentUserId,
            text: '',
            likes: [],
            dateCreated: dateNow,
            dateModified: dateNow,
            comments: []
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
            answer.dataId,
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
        let comment = commentAction.comment;
        const dateNow: string = new Date().toJSON();
        if (!comment) {
          comment = {
            dataId: objectId(),
            ownerRef: this.userService.currentUserId,
            text: '',
            dateCreated: dateNow,
            dateModified: dateNow
          };
        }
        comment.text = commentAction.text;
        comment.dateModified = dateNow;
        this.saveComment(commentAction.answer, comment);
        break;
      case 'show-comments':
        this.projectUserConfigDoc.submitJson0Op(op => {
          for (const comm of commentAction.answer.comments) {
            if (!this.questionsPanel.hasUserReadComment(comm)) {
              op.add(puc => puc.commentRefsRead, comm.dataId);
            }
          }
        });
        break;
      case 'delete':
        this.deleteComment(commentAction.answer, commentAction.comment);
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
    return this.questionsQuery != null ? this.questionsQuery.docs.length : 0;
  }

  private getAnswerIndex(answer: Answer): number {
    return this.questionsPanel.activeQuestionDoc.data.answers.findIndex(
      existingAnswer => existingAnswer.dataId === answer.dataId
    );
  }

  private deleteAnswer(answer: Answer): void {
    const answerIndex = this.getAnswerIndex(answer);
    if (answerIndex >= 0) {
      this.questionsPanel.activeQuestionDoc
        .submitJson0Op(op => op.remove(q => q.answers, answerIndex))
        .then(() => this.projectService.onlineDeleteAudio(this.projectDoc.id, answer.dataId, answer.ownerRef));
      this.refreshSummary();
    }
  }

  private saveAnswer(answer: Answer): void {
    const answers = cloneDeep(this.questionsPanel.activeQuestionDoc.data.answers);
    const answerIndex = this.getAnswerIndex(answer);
    if (answerIndex >= 0) {
      answers[answerIndex] = answer;
    } else {
      answers.unshift(answer);
    }
    this.updateQuestionAnswers(answers, answerIndex);
  }

  private updateQuestionAnswers(answers: Answer[], answerIndex: number): void {
    if (answerIndex >= 0) {
      const oldAnswer = this.questionsPanel.activeQuestionDoc.data.answers[answerIndex];
      const newAnswer = answers[answerIndex];
      const deleteAudio = oldAnswer.audioUrl != null && newAnswer.audioUrl == null;
      const submitPromise = this.questionsPanel.activeQuestionDoc.submitJson0Op(op =>
        op
          .set(q => q.answers[answerIndex].text, newAnswer.text)
          .set(q => q.answers[answerIndex].scriptureText, newAnswer.scriptureText)
          .set(q => q.answers[answerIndex].scriptureStart, newAnswer.scriptureStart)
          .set(q => q.answers[answerIndex].scriptureEnd, newAnswer.scriptureEnd)
          .set(q => q.answers[answerIndex].audioUrl, newAnswer.audioUrl)
          .set(q => q.answers[answerIndex].dateModified, newAnswer.dateModified)
      );
      if (deleteAudio) {
        submitPromise.then(() =>
          this.projectService.onlineDeleteAudio(this.projectDoc.id, oldAnswer.dataId, oldAnswer.ownerRef)
        );
      }
    } else {
      this.questionsPanel.activeQuestionDoc.submitJson0Op(op => op.insert(q => q.answers, 0, answers[0]));
    }
    this.questionsPanel.updateElementsRead(this.questionsPanel.activeQuestionDoc);
  }

  private saveComment(answer: Answer, comment: Comment): void {
    const answerIndex = this.getAnswerIndex(answer);
    const commentIndex = answer.comments.findIndex(c => c.dataId === comment.dataId);
    if (commentIndex >= 0) {
      this.questionsPanel.activeQuestionDoc.submitJson0Op(op =>
        op
          .set(q => q.answers[answerIndex].comments[commentIndex].text, comment.text)
          .set(q => q.answers[answerIndex].comments[commentIndex].dateModified, comment.dateModified)
      );
    } else {
      this.questionsPanel.activeQuestionDoc.submitJson0Op(op =>
        op.insert(q => q.answers[answerIndex].comments, 0, comment)
      );
    }
  }

  private deleteComment(answer: Answer, comment: Comment): void {
    const answerIndex = this.getAnswerIndex(answer);
    const commentIndex = answer.comments.findIndex(c => c.dataId === comment.dataId);
    if (commentIndex >= 0) {
      this.questionsPanel.activeQuestionDoc.submitJson0Op(op =>
        op.remove(q => q.answers[answerIndex].comments, commentIndex)
      );
    }
  }

  private likeAnswer(answer: Answer) {
    const currentUserId = this.userService.currentUserId;
    const likeIndex = answer.likes.findIndex(like => like.ownerRef === currentUserId);
    const answerIndex = this.getAnswerIndex(answer);

    if (likeIndex >= 0) {
      this.questionsPanel.activeQuestionDoc.submitJson0Op(op =>
        op.remove(q => q.answers[answerIndex].likes, likeIndex)
      );
    } else {
      this.questionsPanel.activeQuestionDoc.submitJson0Op(op =>
        op.insert(q => q.answers[answerIndex].likes, 0, {
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
    this.questionsPanel.activeQuestionDoc = null;
    this.projectUserConfigDoc = null;
    if (this.questionsQuery != null) {
      this.questionsQuery.dispose();
    }
    this.questionsQuery = undefined;
    this.projectDoc = null;
    this.text = null;
  }

  private refreshSummary() {
    this.summary.answered = 0;
    this.summary.read = 0;
    this.summary.unread = 0;
    for (const questionDoc of this.questionsQuery.docs) {
      if (CheckingUtils.hasUserAnswered(questionDoc.data, this.userService.currentUserId)) {
        this.summary.answered++;
      } else if (CheckingUtils.hasUserReadQuestion(questionDoc.data, this.projectUserConfigDoc.data)) {
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
