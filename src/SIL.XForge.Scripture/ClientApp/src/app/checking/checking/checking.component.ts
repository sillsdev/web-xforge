import { MdcList, MdcMenuSelectedEvent } from '@angular-mdc/web';
import { Component, ElementRef, HostBinding, OnInit, ViewChild } from '@angular/core';
import { MediaChange, MediaObserver } from '@angular/flex-layout';
import { ActivatedRoute } from '@angular/router';
import { clone } from '@orbit/utils';
import { SplitComponent } from 'angular-split';
import { combineLatest, from } from 'rxjs';
import { filter, map, switchMap } from 'rxjs/operators';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { UserService } from 'xforge-common/user.service';
import { nameof, objectId } from 'xforge-common/utils';
import { HelpHeroService } from '../../core/help-hero.service';
import { Answer } from '../../core/models/answer';
import { Comment } from '../../core/models/comment';
import { CommentsDoc } from '../../core/models/comments-doc';
import { Like } from '../../core/models/like';
import { Question } from '../../core/models/question';
import { QuestionsDoc } from '../../core/models/questions-doc';
import { SFProject } from '../../core/models/sfproject';
import { SFProjectRoles } from '../../core/models/sfproject-roles';
import { SFProjectUser } from '../../core/models/sfproject-user';
import { getTextDocIdStr, TextDocId } from '../../core/models/text-doc-id';
import { TextInfo } from '../../core/models/text-info';
import { SFProjectUserService } from '../../core/sfproject-user.service';
import { SFProjectService } from '../../core/sfproject.service';
import { AnswerAction } from './checking-answers/checking-answers.component';
import { CommentAction } from './checking-answers/checking-comments/checking-comments.component';
import { CheckingQuestionsComponent } from './checking-questions/checking-questions.component';
import { CheckingTextComponent } from './checking-text/checking-text.component';

interface Summary {
  unread: number;
  read: number;
  answered: number;
}

interface CheckingData {
  questionsDocs: { [docId: string]: QuestionsDoc };
  commentsDocs: { [docId: string]: CommentsDoc };
}

@Component({
  selector: 'app-checking',
  templateUrl: './checking.component.html',
  styleUrls: ['./checking.component.scss']
})
export class CheckingComponent extends SubscriptionDisposable implements OnInit {
  @ViewChild('answerPanelContainer') set answersPanelElement(answersPanelContainerElement: ElementRef) {
    // Need to trigger the calculation for the slider after DOM has been updated
    this.answersPanelContainerElement = answersPanelContainerElement;
    this.calculateScriptureSliderPosition(true);
  }

  @HostBinding('class') classes = 'flex-max';
  @ViewChild(CheckingTextComponent) scripturePanel: CheckingTextComponent;
  @ViewChild(CheckingQuestionsComponent) questionsPanel: CheckingQuestionsComponent;
  @ViewChild(SplitComponent) splitComponent: SplitComponent;
  @ViewChild('splitContainer') splitContainerElement: ElementRef;
  @ViewChild('scripturePanelContainer') scripturePanelContainerElement: ElementRef;
  @ViewChild('chapterMenuList') chapterMenuList: MdcList;

  project: SFProject;
  projectCurrentUser: SFProjectUser;
  text: TextInfo;
  questions: Readonly<Question[]> = [];
  checkingData: CheckingData = { questionsDocs: {}, commentsDocs: {} };
  comments: Readonly<Comment[]> = [];
  summary: Summary = {
    read: 0,
    unread: 0,
    answered: 0
  };
  answersPanelContainerElement: ElementRef;
  textDocId: TextDocId;
  chapters: number[] = [];
  isExpanded: boolean = false;
  resetAnswerPanelHeightOnFormHide: boolean = false;

  private _chapter: number;
  private _isDrawerPermanent: boolean = true;

  constructor(
    private readonly activatedRoute: ActivatedRoute,
    private readonly projectService: SFProjectService,
    private readonly userService: UserService,
    private readonly helpHeroService: HelpHeroService,
    private readonly media: MediaObserver,
    private projectUserService: SFProjectUserService
  ) {
    super();
  }

  get chapter(): number {
    return this._chapter;
  }

  set chapter(value: number) {
    if (this._chapter !== value) {
      this._chapter = value;
      this.textDocId = new TextDocId(this.project.id, this.text.bookId, this.chapter, 'target');
      this.comments = this.checkingData.commentsDocs[this.textJsonDocId].data;
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

  private get textJsonDocId(): string {
    return getTextDocIdStr(this.project.id, this.text.bookId, this.chapter);
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
    this.subscribe(
      this.activatedRoute.params.pipe(
        switchMap(params => {
          const projectId = params['projectId'];
          const bookId = params['bookId'];
          return combineLatest(
            this.projectService.get(projectId, [[nameof<SFProject>('users')]]),
            from(this.projectService.getDataDoc(projectId)).pipe(
              map(projectData => projectData.data.texts.find(t => t.bookId === bookId))
            )
          );
        }),
        filter(([projectResults, text]) => projectResults.data != null && text != null)
      ),
      async ([projectResults, text]) => {
        const prevProjectId = this.project == null ? '' : this.project.id;
        const prevBookId = this.text == null ? '' : this.text.bookId;
        this.text = text;
        this.project = projectResults.data;
        this.projectCurrentUser = projectResults
          .getManyIncluded<SFProjectUser>(this.project.users)
          .find(pu => (pu.user == null ? '' : pu.user.id) === this.userService.currentUserId);
        this.chapters = this.text.chapters.map(c => c.number);
        if (prevProjectId !== this.project.id || prevBookId !== this.text.bookId) {
          const bindCheckingDataPromises: Promise<void>[] = [];
          this.questions = [];
          for (const chapter of this.chapters) {
            bindCheckingDataPromises.push(
              this.bindCheckingData(new TextDocId(this.project.id, this.text.bookId, chapter))
            );
          }
          // Trigger the chapter setter to bind the relevant comments.
          await Promise.all(bindCheckingDataPromises);
          this._chapter = undefined;
          this.chapter = 1;
          for (const chapter of this.chapters) {
            this.questions = this.questions.concat(
              this.checkingData.questionsDocs[getTextDocIdStr(this.project.id, this.text.bookId, chapter)].data
            );
          }

          this.startUserOnboardingTour(); // start HelpHero tour for the Community Checking feature
        }
      }
    );
    this.subscribe(this.media.media$, (change: MediaChange) => {
      this.calculateScriptureSliderPosition();
      this.isDrawerPermanent = ['xl', 'lt-xl', 'lg', 'lt-lg', 'md', 'lt-md'].includes(change.mqAlias);
    });
  }

  applyFontChange(fontSize: string) {
    this.scripturePanel.applyFontChange(fontSize);
  }

  answerAction(answerAction: AnswerAction) {
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
        answer.dateModified = dateNow;
        if (answerAction.audio.fileName) {
          this.projectService
            .uploadAudio(
              this.project.id,
              new File([answerAction.audio.blob], answer.id + '-' + answerAction.audio.fileName)
            )
            .then((response: string) => {
              // Get the amended filename and save it against the answer
              answer.audioUrl = response.split('/').pop();
              this.saveAnswer(answer);
            });
        } else {
          this.saveAnswer(answer);
        }
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
            projectRef: this.project.id,
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
        let updateRequired = false;
        for (const comm of this.comments) {
          if (!this.questionsPanel.hasUserReadComment(comm)) {
            this.projectCurrentUser.commentRefsRead.push(comm.id);
            updateRequired = true;
          }
        }
        if (updateRequired) {
          this.projectUserService.update(this.projectCurrentUser);
        }
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
    if (this.questionsPanel.activateQuestionChapter !== this.chapter) {
      this.chapter = this.questionsPanel.activateQuestionChapter;
    }
    this.calculateScriptureSliderPosition(true);
    this.refreshSummary();
    this.collapseDrawer();
  }

  totalQuestions() {
    return this.questions.length;
  }

  private getAnswerIndex(answer: Answer) {
    return this.questionsPanel.activeQuestion.answers.findIndex(existingAnswer => existingAnswer.id === answer.id);
  }

  private getCommentIndex(comment: Comment) {
    return this.comments.findIndex(existingComment => existingComment.id === comment.id);
  }

  private deleteAnswer(answer: Answer) {
    const answerIndex = this.getAnswerIndex(answer);
    if (answerIndex >= 0) {
      const answerComments = this.comments.filter(comment => comment.answerRef === answer.id);
      for (const answerComment of answerComments) {
        this.deleteComment(answerComment);
      }
      // TODO: Need to physically delete any audio file as well on the backend
      this.checkingData.questionsDocs[this.textJsonDocId].deleteFromList(
        this.questionsPanel.activeQuestion.answers[answerIndex],
        [this.activeChapterQuestionIndex, 'answers', answerIndex]
      );
      this.refreshSummary();
    }
  }

  private saveAnswer(answer: Answer) {
    const answers = clone(this.questionsPanel.activeQuestion.answers);
    const answerIndex = this.getAnswerIndex(answer);
    if (answerIndex >= 0) {
      answers[answerIndex] = answer;
    } else {
      answers.unshift(answer);
    }
    this.updateQuestionAnswers(answers, answerIndex);
  }

  private updateQuestionAnswers(answers: Answer[], answerIndex: number) {
    const questionWithAnswer = clone(this.questionsPanel.activeQuestion);
    questionWithAnswer.answers = answers;
    if (answerIndex >= 0) {
      this.checkingData.questionsDocs[this.textJsonDocId].replaceInList(
        this.questionsPanel.activeQuestion.answers[answerIndex],
        questionWithAnswer.answers[answerIndex],
        [this.activeChapterQuestionIndex, nameof<Question>('answers'), answerIndex]
      );
    } else {
      this.checkingData.questionsDocs[this.textJsonDocId].insertInList(questionWithAnswer.answers[0], [
        this.activeChapterQuestionIndex,
        nameof<Question>('answers'),
        0
      ]);
    }
    this.refreshSummary();
  }

  get activeChapterQuestionIndex(): number {
    return this.checkingData.questionsDocs[this.textJsonDocId].data.findIndex(
      question => question.id === this.questionsPanel.activeQuestion.id
    );
  }

  private saveComment(comment: Comment) {
    const comments = <Comment[]>clone(this.comments);
    const commentIndex = this.getCommentIndex(comment);
    if (commentIndex >= 0) {
      this.checkingData.commentsDocs[this.textJsonDocId].replaceInList(comments[commentIndex], comment, [commentIndex]);
    } else {
      this.checkingData.commentsDocs[this.textJsonDocId].insertInList(comment);
    }
  }

  private deleteComment(comment: Comment) {
    const commentIndex = this.getCommentIndex(comment);
    if (commentIndex >= 0) {
      this.checkingData.commentsDocs[this.textJsonDocId].deleteFromList(comment, [commentIndex]);
    }
  }

  private likeAnswer(answer: Answer) {
    const currentUserId = this.userService.currentUserId;
    const likeIndex = answer.likes.findIndex(like => like.ownerRef === currentUserId);
    const answerIndex = this.getAnswerIndex(answer);

    if (likeIndex >= 0) {
      this.checkingData.questionsDocs[this.textJsonDocId].deleteFromList(answer.likes[likeIndex], [
        this.activeChapterQuestionIndex,
        nameof<Question>('answers'),
        answerIndex,
        nameof<Answer>('likes'),
        likeIndex
      ]);
    } else {
      this.checkingData.questionsDocs[this.textJsonDocId].insertInList({ ownerRef: currentUserId } as Like, [
        this.activeChapterQuestionIndex,
        nameof<Question>('answers'),
        answerIndex,
        nameof<Answer>('likes'),
        0
      ]);
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
    }, 1);
  }

  private async bindCheckingData(id: TextDocId): Promise<void> {
    if (id == null) {
      return;
    }

    this.unbindCheckingData(id);
    this.checkingData.questionsDocs[id.toString()] = await this.projectService.getQuestionsDoc(id);
    this.checkingData.commentsDocs[id.toString()] = await this.projectService.getCommentsDoc(id);
  }

  private unbindCheckingData(id: TextDocId): void {
    if (!(id.toString() in this.checkingData.questionsDocs)) {
      return;
    }

    delete this.checkingData.questionsDocs[id.toString()];
    delete this.checkingData.commentsDocs[id.toString()];
  }

  private refreshSummary() {
    this.summary.answered = 0;
    this.summary.read = 0;
    this.summary.unread = 0;
    for (const question of this.questions) {
      if (this.questionsPanel.hasUserAnswered(question)) {
        this.summary.answered++;
      } else if (this.questionsPanel.hasUserReadQuestion(question)) {
        this.summary.read++;
      } else {
        this.summary.unread++;
      }
    }
  }

  private startUserOnboardingTour() {
    // HelpHero user-onboarding tour setup
    const isProjectAdmin: boolean = this.projectCurrentUser.role === SFProjectRoles.ParatextAdministrator;
    const isDiscussionEnabled: boolean = this.project.usersSeeEachOthersResponses;
    const isInvitingEnabled: boolean = this.project.shareEnabled;

    this.helpHeroService.setProperty({
      isAdmin: isProjectAdmin,
      discussionEnabled: isDiscussionEnabled,
      invitingEnabled: isInvitingEnabled
    });

    // tell HelpHero to remember this user to make sure we won't show them the tour again later
    this.helpHeroService.setIdentity(this.projectCurrentUser.id);

    // start the Community Checking tour
    if (isProjectAdmin) {
      // start Admin tour
      this.helpHeroService.startTour('sLbG6FRjjVo', { skipIfAlreadySeen: true });
    } else if (isDiscussionEnabled) {
      // start Reviewer tour w/ discussion
      this.helpHeroService.startTour('39HmnsRplaw', { skipIfAlreadySeen: true });
      this.helpHeroService.on('tour_completed', () => {
        if (isInvitingEnabled) {
          // run invite section of the tour
          this.helpHeroService.startTour('MexTla8sdju', { skipIfAlreadySeen: true });
          this.helpHeroService.on('tour_completed', () => {
            // show end of Reviewer tour
            this.helpHeroService.startTour('dUubb24GYZs', { skipIfAlreadySeen: true });
          });
        } else {
          // show end of Reviewer tour
          this.helpHeroService.startTour('dUubb24GYZs', { skipIfAlreadySeen: true });
        }
      });
    } else {
      // start Reviewer tour (w/o discussion)
      this.helpHeroService.startTour('1ikmHlDXktB', { skipIfAlreadySeen: true });
      this.helpHeroService.on('tour_completed', () => {
        // show end of Reviewer tour
        this.helpHeroService.startTour('dUubb24GYZs', { skipIfAlreadySeen: true });
      });
    }
  }
}
