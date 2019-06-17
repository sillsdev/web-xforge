import { MdcList, MdcMenuSelectedEvent } from '@angular-mdc/web';
import { Component, ElementRef, HostBinding, OnInit, ViewChild } from '@angular/core';
import { MediaChange, MediaObserver } from '@angular/flex-layout';
import { ActivatedRoute } from '@angular/router';
import { clone } from '@orbit/utils';
import { SplitComponent } from 'angular-split';
import { switchMap } from 'rxjs/operators';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { UserService } from 'xforge-common/user.service';
import { nameof, objectId } from 'xforge-common/utils';
import { Answer } from '../../core/models/answer';
import { Comment } from '../../core/models/comment';
import { CommentData } from '../../core/models/comment-data';
import { Like } from '../../core/models/like';
import { Question } from '../../core/models/question';
import { QuestionData } from '../../core/models/question-data';
import { SFProject } from '../../core/models/sfproject';
import { SFProjectUser } from '../../core/models/sfproject-user';
import { Text } from '../../core/models/text';
import { TextDataId } from '../../core/models/text-data';
import { getTextJsonDataIdStr, TextJsonDataId } from '../../core/models/text-json-data-id';
import { SFProjectUserService } from '../../core/sfproject-user.service';
import { TextService } from '../../core/text.service';
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
  questionData: { [textId: string]: QuestionData };
  commentData: { [textId: string]: CommentData };
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
  text: Text;
  questions: Readonly<Question[]> = [];
  checkingData: CheckingData = { questionData: {}, commentData: {} };
  comments: Readonly<Comment[]> = [];
  summary: Summary = {
    read: 0,
    unread: 0,
    answered: 0
  };
  answersPanelContainerElement: ElementRef;
  textDataId: TextDataId;
  chapters: number[] = [];
  isExpanded: boolean = false;

  private _chapter: number;
  private _isDrawerPermanent: boolean = true;

  constructor(
    private activatedRoute: ActivatedRoute,
    private textService: TextService,
    private readonly userService: UserService,
    private media: MediaObserver,
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
      this.textDataId = new TextDataId(this.text.id, this.chapter);
      this.comments = this.checkingData.commentData[this.textJsonDataId].data;
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

  private get textJsonDataId(): string {
    return getTextJsonDataIdStr(this.text.id, this.chapter);
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
          return this.textService.get(params['textId'], [[nameof<Text>('project'), nameof<SFProject>('users')]]);
        })
      ),
      async textData => {
        const prevTextId = this.text == null ? '' : this.text.id;
        this.text = textData.data;
        if (this.text != null) {
          this.project = textData.getIncluded(this.text.project);
          this.projectCurrentUser = textData
            .getManyIncluded<SFProjectUser>(this.project.users)
            .find(pu => (pu.user == null ? '' : pu.user.id) === this.userService.currentUserId);
          this.chapters = this.text.chapters.map(c => c.number);
          if (prevTextId !== this.text.id) {
            const bindCheckingDataPromises: Promise<void>[] = [];
            this.questions = [];
            for (const chapter of this.chapters) {
              bindCheckingDataPromises.push(this.bindCheckingData(new TextJsonDataId(this.text.id, chapter)));
            }
            // Trigger the chapter setter to bind the relevant comments.
            await Promise.all(bindCheckingDataPromises);
            this._chapter = undefined;
            this.chapter = 1;
            for (const chapter of this.chapters) {
              this.questions = this.questions.concat(
                this.checkingData.questionData[getTextJsonDataIdStr(this.text.id, chapter)].data
              );
            }
          }
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
    if (answerAction.action === 'save') {
      let answer: Answer = answerAction.answer;
      const dateNow: string = new Date().toUTCString();
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
      this.saveAnswer(answer);
    } else if (answerAction.action === 'delete') {
      this.deleteAnswer(answerAction.answer);
    } else if (answerAction.action === 'like') {
      this.likeAnswer(answerAction.answer);
    }
    this.calculateScriptureSliderPosition(true);
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
    if (commentAction.action === 'save') {
      let comment: Comment = commentAction.comment;
      const dateNow: string = new Date().toUTCString();
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
    } else if (commentAction.action === 'show-comments') {
      let updateRequired = false;
      for (const comment of this.comments) {
        if (!this.questionsPanel.hasUserReadComment(comment)) {
          this.projectCurrentUser.commentRefsRead.push(comment.id);
          updateRequired = true;
        }
      }
      if (updateRequired) {
        this.projectUserService.update(this.projectCurrentUser);
      }
    } else if (commentAction.action === 'delete') {
      this.deleteComment(commentAction.comment);
    }
    this.calculateScriptureSliderPosition(true);
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
      this.checkingData.questionData[this.textJsonDataId].deleteFromList(
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
      this.checkingData.questionData[this.textJsonDataId].replaceInList(
        this.questionsPanel.activeQuestion.answers[answerIndex],
        questionWithAnswer.answers[answerIndex],
        [this.activeChapterQuestionIndex, nameof<Question>('answers'), answerIndex]
      );
    } else {
      this.checkingData.questionData[this.textJsonDataId].insertInList(questionWithAnswer.answers[0], [
        this.activeChapterQuestionIndex,
        nameof<Question>('answers'),
        0
      ]);
    }
    this.refreshSummary();
  }

  get activeChapterQuestionIndex(): number {
    return this.checkingData.questionData[this.textJsonDataId].data.findIndex(
      question => question.id === this.questionsPanel.activeQuestion.id
    );
  }

  private saveComment(comment: Comment) {
    const comments = <Comment[]>clone(this.comments);
    const commentIndex = this.getCommentIndex(comment);
    if (commentIndex >= 0) {
      this.checkingData.commentData[this.textJsonDataId].replaceInList(comments[commentIndex], comment, [commentIndex]);
    } else {
      this.checkingData.commentData[this.textJsonDataId].insertInList(comment);
    }
  }

  private deleteComment(comment: Comment) {
    const commentIndex = this.getCommentIndex(comment);
    if (commentIndex >= 0) {
      this.checkingData.commentData[this.textJsonDataId].deleteFromList(comment, [commentIndex]);
    }
  }

  private likeAnswer(answer: Answer) {
    const currentUserId = this.userService.currentUserId;
    const likeIndex = answer.likes.findIndex(like => like.ownerRef === currentUserId);
    const answerIndex = this.getAnswerIndex(answer);

    if (likeIndex >= 0) {
      this.checkingData.questionData[this.textJsonDataId].deleteFromList(answer.likes[likeIndex], [
        this.activeChapterQuestionIndex,
        nameof<Question>('answers'),
        answerIndex,
        nameof<Answer>('likes'),
        likeIndex
      ]);
    } else {
      this.checkingData.questionData[this.textJsonDataId].insertInList({ ownerRef: currentUserId } as Like, [
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
      let answerPanelHeight = maximizeAnswerPanel ? this.maxAnswerPanelHeight : this.minAnswerPanelHeight;
      if (answerPanelHeight > 100) {
        answerPanelHeight = 100;
      }
      const scripturePanelHeight = 100 - answerPanelHeight;
      this.splitComponent.setVisibleAreaSizes([scripturePanelHeight, answerPanelHeight]);
    }, 1);
  }

  private async bindCheckingData(id: TextJsonDataId): Promise<void> {
    if (id == null) {
      return;
    }

    this.unbindCheckingData(id);
    this.checkingData.questionData[id.toString()] = await this.textService.getQuestionData(id);
    this.checkingData.commentData[id.toString()] = await this.textService.getCommentData(id);
  }

  private unbindCheckingData(id: TextJsonDataId): void {
    if (!(id.toString() in this.checkingData.questionData)) {
      return;
    }

    delete this.checkingData.questionData[id.toString()];
    delete this.checkingData.commentData[id.toString()];
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
}
