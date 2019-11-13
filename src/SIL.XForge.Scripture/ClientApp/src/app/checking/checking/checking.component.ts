import { MdcDialog, MdcDialogConfig, MdcDialogRef } from '@angular-mdc/web/dialog';
import { MdcList } from '@angular-mdc/web/list';
import { MdcMenuSelectedEvent } from '@angular-mdc/web/menu';
import { Component, ElementRef, HostBinding, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { MediaChange, MediaObserver } from '@angular/flex-layout';
import { ActivatedRoute, Router } from '@angular/router';
import { SplitComponent } from 'angular-split';
import cloneDeep from 'lodash/cloneDeep';
import { Answer } from 'realtime-server/lib/scriptureforge/models/answer';
import { Comment } from 'realtime-server/lib/scriptureforge/models/comment';
import { SFProjectRole } from 'realtime-server/lib/scriptureforge/models/sf-project-role';
import { TextInfo } from 'realtime-server/lib/scriptureforge/models/text-info';
import { toVerseRef } from 'realtime-server/lib/scriptureforge/models/verse-ref-data';
import { Canon } from 'realtime-server/lib/scriptureforge/scripture-utils/canon';
import { VerseRef } from 'realtime-server/lib/scriptureforge/scripture-utils/verse-ref';
import { merge, Subscription } from 'rxjs';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { UserService } from 'xforge-common/user.service';
import { objectId } from 'xforge-common/utils';
import { HelpHeroService } from '../../core/help-hero.service';
import { QuestionDoc } from '../../core/models/question-doc';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { SFProjectUserConfigDoc } from '../../core/models/sf-project-user-config-doc';
import { TextDocId } from '../../core/models/text-doc';
import { TextsByBookId } from '../../core/models/texts-by-book-id';
import { SFProjectService } from '../../core/sf-project.service';
import {
  ScriptureChooserDialogComponent,
  ScriptureChooserDialogData
} from '../../scripture-chooser-dialog/scripture-chooser-dialog.component';
import { CheckingUtils } from '../checking.utils';
import { QuestionDialogData } from '../question-dialog/question-dialog.component';
import { QuestionDialogService } from '../question-dialog/question-dialog.service';
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
  userDoc?: UserDoc;
  @ViewChild('answerPanelContainer', { static: false }) set answersPanelElement(
    answersPanelContainerElement: ElementRef
  ) {
    // Need to trigger the calculation for the slider after DOM has been updated
    this.answersPanelContainerElement = answersPanelContainerElement;
    this.calculateScriptureSliderPosition(true);
  }

  @HostBinding('class') classes = 'flex-max';
  @ViewChild(CheckingAnswersComponent, { static: false }) answersPanel?: CheckingAnswersComponent;
  @ViewChild(CheckingTextComponent, { static: true }) scripturePanel!: CheckingTextComponent;
  @ViewChild(CheckingQuestionsComponent, { static: true }) questionsPanel!: CheckingQuestionsComponent;
  @ViewChild(SplitComponent, { static: true }) splitComponent!: SplitComponent;
  @ViewChild('splitContainer', { static: true }) splitContainerElement!: ElementRef;
  @ViewChild('scripturePanelContainer', { static: true }) scripturePanelContainerElement!: ElementRef;
  @ViewChild('chapterMenuList', { static: true }) chapterMenuList!: MdcList;

  chapters: number[] = [];
  isExpanded: boolean = false;
  resetAnswerPanelHeightOnFormHide: boolean = false;
  showAllBooks: boolean = false;
  summary: Summary = {
    read: 0,
    unread: 0,
    answered: 0
  };
  bookVerseRefs: VerseRef[] = [];

  answersPanelContainerElement?: ElementRef;
  projectDoc?: SFProjectDoc;
  projectUserConfigDoc?: SFProjectUserConfigDoc;
  textDocId?: TextDocId;

  private _book?: number;
  private _isDrawerPermanent: boolean = true;
  private _chapter?: number;
  private questionsQuery?: RealtimeQuery<QuestionDoc>;
  private questionsSub?: Subscription;
  private projectDeleteSub?: Subscription;
  private projectRemoteChangesSub?: Subscription;
  private text?: TextInfo;

  constructor(
    private readonly activatedRoute: ActivatedRoute,
    private readonly projectService: SFProjectService,
    private readonly userService: UserService,
    private readonly helpHeroService: HelpHeroService,
    private readonly media: MediaObserver,
    private readonly dialog: MdcDialog,
    noticeService: NoticeService,
    private readonly router: Router,
    private readonly questionDialogService: QuestionDialogService
  ) {
    super(noticeService);
  }

  private get book(): number | undefined {
    return this._book;
  }

  private set book(book: number | undefined) {
    if (book === this.book) {
      return;
    }
    const questionDocs = this.questionDocs;
    if (this.projectDoc == null || this.projectDoc.data == null || questionDocs.length === 0) {
      return;
    }
    /** Get the book from the first question if showing all the questions
     *  - Note that this only happens on first load as the book will be changed
     *    later on via other methods
     */
    if (book === 0) {
      const firstQuestion = questionDocs[0];
      this.questionsPanel.activateQuestion(firstQuestion);
      if (firstQuestion.data != null) {
        book = firstQuestion.data.verseRef.bookNum;
      } else {
        book = undefined;
      }
    }
    this._book = book;
    this.text = this.projectDoc.data.texts.find(t => t.bookNum === book);
    this.chapters = this.text == null ? [] : this.text.chapters.map(c => c.number);
    this._chapter = undefined;
    this.chapter = this.questionsPanel.activeQuestionChapter;
    this.checkBookStatus();
  }

  get bookName(): string {
    return this.text != null ? Canon.bookNumberToEnglishName(this.text.bookNum) : '';
  }

  get chapter(): number | undefined {
    return this._chapter;
  }

  set chapter(value: number | undefined) {
    if (this._chapter !== value) {
      this._chapter = value;
      this.textDocId =
        this.projectDoc != null && this.text != null && this.chapter != null
          ? new TextDocId(this.projectDoc.id, this.text.bookNum, this.chapter, 'target')
          : undefined;
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

  get isProjectAdmin(): boolean {
    return (
      this.projectDoc != null &&
      this.projectDoc.data != null &&
      this.projectDoc.data.userRoles[this.userService.currentUserId] === SFProjectRole.ParatextAdministrator
    );
  }

  get questionDocs(): Readonly<QuestionDoc[]> {
    return this.questionsQuery != null ? this.questionsQuery.docs : [];
  }

  get textsByBookId(): TextsByBookId {
    const textsByBook: TextsByBookId = {};
    if (this.projectDoc != null && this.projectDoc.data != null) {
      for (const text of this.projectDoc.data.texts) {
        textsByBook[Canon.bookNumberToId(text.bookNum)] = text;
      }
    }
    return textsByBook;
  }

  private get answerPanelElementHeight(): number {
    return this.answersPanelContainerElement != null ? this.answersPanelContainerElement.nativeElement.offsetHeight : 0;
  }

  /** Height in px needed to show all elements in the bottom
   * half of the answer panel splitter without them needing
   * to vertically scroll. */
  private get fullyExpandedAnswerPanelHeight(): number {
    if (this.answersPanelContainerElement == null) {
      return 0;
    }

    const answersPanelVerticalPadding =
      this.getCSSFloatPropertyOf(this.answersPanelContainerElement, 'padding-top') +
      this.getCSSFloatPropertyOf(this.answersPanelContainerElement, 'padding-bottom');

    const actionsAreaHeight = this.getOffsetHeight(this.answersPanelContainerElement, '.actions');

    const scrollPartHeight = this.getMinScrollHeight(
      this.answersPanelContainerElement,
      '.answers-component-scrollable-content'
    );

    const totalAnswersMessageTopMargin = this.getCSSFloatProperty(
      this.answersPanelContainerElement,
      '#totalAnswersMessage',
      'margin-top'
    );

    const showUnreadsBannerHeight = this.getOffsetHeight(
      this.answersPanelContainerElement,
      '.answers-component-footer'
    );

    return (
      answersPanelVerticalPadding +
      actionsAreaHeight +
      scrollPartHeight +
      totalAnswersMessageTopMargin +
      showUnreadsBannerHeight
    );
  }

  /** Minimum height in px to show no more than these
   * elements in the bottom half of the answer panel splitter:
   * - Question
   * - Answer count, if present
   * - show-more-answers banner, if present
   * - add-answer button, if present
   */
  private get answerPanelElementMinimumHeight(): number {
    // Note: Alternate implementations can end up showing
    // the top border of the first answer, if the browser
    // window is tall. So that can be looked for when modifying
    // this method.

    if (this.answersPanelContainerElement == null) {
      return 0;
    }

    const totalAnswersMessage = document.querySelector('#totalAnswersMessage') as Element;
    const distanceFromTopToTotalAnswersMessageBottom =
      totalAnswersMessage == null
        ? 0
        : totalAnswersMessage.getBoundingClientRect().bottom -
          this.answersPanelContainerElement.nativeElement.getBoundingClientRect().top;

    const actionsArea = document.querySelector('.actions') as Element;
    const distanceFromTopToAddAnswerButtonButtom =
      actionsArea == null
        ? 0
        : actionsArea.getBoundingClientRect().bottom -
          this.answersPanelContainerElement.nativeElement.getBoundingClientRect().top;

    const showUnreadsBannerHeight = this.getOffsetHeight(
      this.answersPanelContainerElement,
      '.answers-component-footer'
    );

    const answersPanelVerticalPadding =
      this.getCSSFloatPropertyOf(this.answersPanelContainerElement, 'padding-top') +
      this.getCSSFloatPropertyOf(this.answersPanelContainerElement, 'padding-bottom');

    return (
      Math.max(distanceFromTopToTotalAnswersMessageBottom, distanceFromTopToAddAnswerButtonButtom) +
      answersPanelVerticalPadding +
      showUnreadsBannerHeight
    );
  }

  private get minAnswerPanelPercent(): number {
    return Math.ceil((this.answerPanelElementMinimumHeight / this.splitContainerElementHeight) * 100);
  }
  private get currentAnswerPanelPercent(): number {
    return Math.ceil((this.answerPanelElementHeight / this.splitContainerElementHeight) * 100);
  }

  private get fullyExpandedAnswerPanelPercent(): number {
    return Math.ceil((this.fullyExpandedAnswerPanelHeight / this.splitContainerElementHeight) * 100);
  }

  private get splitContainerElementHeight(): number {
    return this.splitContainerElement ? this.splitContainerElement.nativeElement.offsetHeight : 0;
  }

  ngOnInit(): void {
    this.subscribe(this.activatedRoute.params, async params => {
      this.loadingStarted();
      const projectId = params['projectId'] as string;
      const bookId = params['bookId'] as string;
      const prevProjectId = this.projectDoc == null ? '' : this.projectDoc.id;
      this.projectDoc = await this.projectService.get(projectId);
      if (!this.projectDoc.isLoaded) {
        return;
      }
      const bookNum = bookId == null ? 0 : Canon.bookIdToNumber(bookId);
      this.projectUserConfigDoc = await this.projectService.getUserConfig(projectId, this.userService.currentUserId);
      if (prevProjectId !== this.projectDoc.id || this.book !== bookNum || (bookId !== 'ALL' && this.showAllBooks)) {
        if (this.questionsQuery != null) {
          this.questionsQuery.dispose();
        }
        this.showAllBooks = bookId === 'ALL';
        this.questionsQuery = await this.projectService.queryQuestions(projectId, {
          bookNum: this.showAllBooks ? undefined : bookNum,
          activeOnly: true,
          sort: true
        });
        if (this.questionsSub != null) {
          this.questionsSub.unsubscribe();
        }
        this.questionsSub = this.subscribe(merge(this.questionsQuery.ready$, this.questionsQuery.remoteChanges$), () =>
          this.checkBookStatus()
        );
        this.book = bookNum;
        this.userDoc = await this.userService.getCurrentUser();
        this.startUserOnboardingTour(); // start HelpHero tour for the Community Checking feature
        this.loadingFinished();
      }
      // Subscribe to the projectDoc now that it is defined
      if (this.projectRemoteChangesSub != null) {
        this.projectRemoteChangesSub.unsubscribe();
      }
      this.projectRemoteChangesSub = this.subscribe(this.projectDoc.remoteChanges$, () => {
        if (
          this.projectDoc != null &&
          this.projectDoc.data != null &&
          !(this.userService.currentUserId in this.projectDoc.data.userRoles)
        ) {
          this.onRemovedFromProject();
        }
      });
      if (this.projectDeleteSub != null) {
        this.projectDeleteSub.unsubscribe();
      }
      this.projectDeleteSub = this.subscribe(this.projectDoc.delete$, () => this.onRemovedFromProject());
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

  async answerAction(answerAction: AnswerAction): Promise<void> {
    if (this.projectDoc == null) {
      return;
    }

    let useMaxAnswersPanelSize: boolean = true;
    switch (answerAction.action) {
      case 'save':
        let answer = answerAction.answer;
        const dateNow: string = new Date().toJSON();
        if (answer == null) {
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
        answer.verseRef = answerAction.verseRef;
        answer.dateModified = dateNow;
        if (answerAction.audio != null) {
          if (answerAction.audio.fileName != null && answerAction.audio.blob != null) {
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
        }
        this.saveAnswer(answer);
        break;
      case 'delete':
        if (answerAction.answer != null) {
          this.deleteAnswer(answerAction.answer);
        }
        break;
      case 'like':
        if (answerAction.answer != null) {
          this.likeAnswer(answerAction.answer);
        }
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
      if (this._chapter != null) {
        this.chapterMenuList.focusItemAtIndex(this._chapter - 1);
      }
    }, 10);
  }

  commentAction(commentAction: CommentAction) {
    let useMaxAnswersPanelSize: boolean = true;
    switch (commentAction.action) {
      case 'save':
        if (commentAction.answer != null) {
          let comment = commentAction.comment;
          const dateNow: string = new Date().toJSON();
          if (comment == null) {
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
        }
        break;
      case 'show-comments':
        if (this.projectUserConfigDoc != null) {
          this.projectUserConfigDoc.submitJson0Op(op => {
            if (commentAction.answer != null) {
              for (const comm of commentAction.answer.comments) {
                if (!this.questionsPanel.hasUserReadComment(comm)) {
                  op.add(puc => puc.commentRefsRead, comm.dataId);
                }
              }
            }
          });
        }
        break;
      case 'delete':
        if (commentAction.answer != null && commentAction.comment != null) {
          this.deleteComment(commentAction.answer, commentAction.comment);
        }
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
      if (event.sizes[1] < this.minAnswerPanelPercent) {
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

  openScriptureChooser() {
    const dialogConfig: MdcDialogConfig<ScriptureChooserDialogData> = {
      data: { booksAndChaptersToShow: this.textsByBookId, includeVerseSelection: false }
    };

    const dialogRef = this.dialog.open(ScriptureChooserDialogComponent, dialogConfig) as MdcDialogRef<
      ScriptureChooserDialogComponent,
      VerseRef | 'close'
    >;
    dialogRef.afterClosed().subscribe(result => {
      if (result != null && result !== 'close') {
        this.book = result.bookNum;
        this.chapter = result.chapterNum;
      }
    });
  }

  questionUpdated(_questionDoc: QuestionDoc) {
    this.refreshSummary();
  }

  questionChanged(questionDoc: QuestionDoc) {
    this.book = questionDoc.data == null ? undefined : questionDoc.data.verseRef.bookNum;
    this.chapter = this.questionsPanel.activeQuestionChapter;
    this.calculateScriptureSliderPosition(true);
    this.refreshSummary();
    this.collapseDrawer();
  }

  async questionDialog(): Promise<void> {
    if (this.projectDoc == null) {
      return;
    }

    const data: QuestionDialogData = {
      question: undefined,
      textsByBookId: this.textsByBookId,
      projectId: this.projectDoc.id,
      defaultVerse: new VerseRef(this.book, this.chapter, 1)
    };
    const newQuestion = await this.questionDialogService.questionDialog(data);
    if (newQuestion != null) {
      this.questionsPanel.activateQuestion(newQuestion);
    }
  }

  totalQuestions(): number {
    return this.questionsQuery != null ? this.questionsQuery.docs.length : 0;
  }

  verseRefClicked(verseRef: VerseRef) {
    let bestMatch: QuestionDoc | undefined;

    for (const questionDoc of this.questionDocs) {
      const questionVerseRef = questionDoc.data == null ? undefined : toVerseRef(questionDoc.data.verseRef);
      if (questionVerseRef == null || questionVerseRef.bookNum !== this.book) {
        continue;
      }
      if (questionVerseRef.chapterNum === verseRef.chapterNum && questionVerseRef.verseNum === verseRef.verseNum) {
        bestMatch = questionDoc;
        break;
      } else if (
        questionVerseRef.chapterNum === verseRef.chapterNum &&
        questionVerseRef.verseNum <= verseRef.verseNum
      ) {
        const allVerses = questionVerseRef.allVerses(true);
        const endRef = allVerses[allVerses.length - 1];
        if (endRef.verseNum >= verseRef.verseNum) {
          bestMatch = questionDoc;
        }
      }
    }
    if (bestMatch != null) {
      this.questionsPanel.activateQuestion(bestMatch);
    }
  }

  private checkBookStatus(): void {
    if (this.projectDoc == null || this.questionsQuery == null || !this.questionsQuery.ready) {
      return;
    }
    if (this.totalQuestions() === 0) {
      this.router.navigate(['/projects', this.projectDoc.id, 'checking'], {
        replaceUrl: true
      });
    } else if (this.showAllBooks) {
      const availableBooks = new Set<string>();
      for (const questionDoc of this.questionDocs) {
        const questionVerseRef = questionDoc.data == null ? undefined : toVerseRef(questionDoc.data.verseRef);
        if (questionVerseRef != null && !availableBooks.has(questionVerseRef.book)) {
          availableBooks.add(questionVerseRef.book);
        }
      }
      if (availableBooks.size === 1) {
        this.router.navigate(['/projects', this.projectDoc.id, 'checking', availableBooks.values().next().value], {
          replaceUrl: true
        });
      }
    }
    // Only pass in relevant verse references to the text component
    const bookVerseRefs: VerseRef[] = [];
    for (const questionDoc of this.questionDocs) {
      const questionVerseRef = questionDoc.data == null ? undefined : toVerseRef(questionDoc.data.verseRef);
      if (questionVerseRef != null && questionVerseRef.bookNum === this.book) {
        bookVerseRefs.push(questionVerseRef);
      }
    }
    this.bookVerseRefs = bookVerseRefs;
  }

  private getAnswerIndex(answer: Answer): number {
    const activeQuestionDoc = this.questionsPanel.activeQuestionDoc;
    return activeQuestionDoc == null || activeQuestionDoc.data == null
      ? -1
      : activeQuestionDoc.data.answers.findIndex(existingAnswer => existingAnswer.dataId === answer.dataId);
  }

  private deleteAnswer(answer: Answer): void {
    if (this.questionsPanel.activeQuestionDoc == null) {
      return;
    }
    const answerIndex = this.getAnswerIndex(answer);
    if (answerIndex >= 0) {
      this.questionsPanel.activeQuestionDoc
        .submitJson0Op(op => op.remove(q => q.answers, answerIndex))
        .then(() => {
          if (this.projectDoc != null) {
            this.projectService.onlineDeleteAudio(this.projectDoc.id, answer.dataId, answer.ownerRef);
          }
        });
      this.refreshSummary();
    }
  }

  private saveAnswer(answer: Answer): void {
    const activeQuestionDoc = this.questionsPanel.activeQuestionDoc;
    if (activeQuestionDoc == null || activeQuestionDoc.data == null) {
      return;
    }
    const answers = cloneDeep(activeQuestionDoc.data.answers);
    const answerIndex = this.getAnswerIndex(answer);
    if (answerIndex >= 0) {
      answers[answerIndex] = answer;
    } else {
      answers.unshift(answer);
    }
    if (answerIndex >= 0) {
      const oldAnswer = activeQuestionDoc.data.answers[answerIndex];
      const newAnswer = answers[answerIndex];
      const deleteAudio = oldAnswer.audioUrl != null && newAnswer.audioUrl == null;
      const submitPromise = activeQuestionDoc.submitJson0Op(op =>
        op
          .set(q => q.answers[answerIndex].text, newAnswer.text)
          .set(q => q.answers[answerIndex].scriptureText, newAnswer.scriptureText)
          .set(q => q.answers[answerIndex].verseRef, newAnswer.verseRef)
          .set(q => q.answers[answerIndex].audioUrl, newAnswer.audioUrl)
          .set(q => q.answers[answerIndex].dateModified, newAnswer.dateModified)
      );
      if (deleteAudio) {
        submitPromise.then(() => {
          if (this.projectDoc != null) {
            this.projectService.onlineDeleteAudio(this.projectDoc.id, oldAnswer.dataId, oldAnswer.ownerRef);
          }
        });
      }
    } else {
      activeQuestionDoc.submitJson0Op(op => op.insert(q => q.answers, 0, answers[0]));
    }
    this.questionsPanel.updateElementsRead(activeQuestionDoc);
  }

  private saveComment(answer: Answer, comment: Comment): void {
    const activeQuestionDoc = this.questionsPanel.activeQuestionDoc;
    if (activeQuestionDoc == null || activeQuestionDoc.data == null) {
      return;
    }

    const answerIndex = this.getAnswerIndex(answer);
    const commentIndex = answer.comments.findIndex(c => c.dataId === comment.dataId);
    if (commentIndex >= 0) {
      activeQuestionDoc.submitJson0Op(op =>
        op
          .set(q => q.answers[answerIndex].comments[commentIndex].text, comment.text)
          .set(q => q.answers[answerIndex].comments[commentIndex].dateModified, comment.dateModified)
      );
    } else {
      activeQuestionDoc.submitJson0Op(op => op.insert(q => q.answers[answerIndex].comments, 0, comment));
    }
  }

  private deleteComment(answer: Answer, comment: Comment): void {
    const activeQuestionDoc = this.questionsPanel.activeQuestionDoc;
    if (activeQuestionDoc == null || activeQuestionDoc.data == null) {
      return;
    }

    const answerIndex = this.getAnswerIndex(answer);
    const commentIndex = answer.comments.findIndex(c => c.dataId === comment.dataId);
    if (commentIndex >= 0) {
      activeQuestionDoc.submitJson0Op(op => op.remove(q => q.answers[answerIndex].comments, commentIndex));
    }
  }

  private likeAnswer(answer: Answer) {
    const activeQuestionDoc = this.questionsPanel.activeQuestionDoc;
    if (activeQuestionDoc == null || activeQuestionDoc.data == null) {
      return;
    }

    const currentUserId = this.userService.currentUserId;
    const likeIndex = answer.likes.findIndex(like => like.ownerRef === currentUserId);
    const answerIndex = this.getAnswerIndex(answer);

    if (likeIndex >= 0) {
      activeQuestionDoc.submitJson0Op(op => op.remove(q => q.answers[answerIndex].likes, likeIndex));
    } else {
      activeQuestionDoc.submitJson0Op(op =>
        op.insert(q => q.answers[answerIndex].likes, 0, {
          ownerRef: currentUserId
        })
      );
    }
  }

  private calculateScriptureSliderPosition(maximizeAnswerPanel: boolean = false): void {
    const waitMs: number = 100;
    // Wait while Angular updates visible DOM elements before we can calculate the height correctly
    setTimeout((): void => {
      let answerPanelHeight: number;
      if (maximizeAnswerPanel) {
        answerPanelHeight = this.fullyExpandedAnswerPanelPercent;
      } else if (this.resetAnswerPanelHeightOnFormHide) {
        // Default the answers panel size to 50% so the scripture panel shows after answers and comments are added
        answerPanelHeight = this.currentAnswerPanelPercent < 50 ? this.currentAnswerPanelPercent : 50;
        this.resetAnswerPanelHeightOnFormHide = false;
      } else {
        answerPanelHeight = this.minAnswerPanelPercent;
      }

      if (answerPanelHeight > 100) {
        answerPanelHeight = 100;
      }
      const scripturePanelHeight = 100 - answerPanelHeight;
      this.splitComponent.setVisibleAreaSizes([scripturePanelHeight, answerPanelHeight]);
    }, waitMs);
  }

  // Unbind this component from the data when a user is removed from the project, otherwise console
  // errors appear before the app can navigate to the start component
  private onRemovedFromProject() {
    this.questionsPanel.activeQuestionDoc = undefined;
    this.projectUserConfigDoc = undefined;
    if (this.questionsQuery != null) {
      this.questionsQuery.dispose();
    }
    this.questionsQuery = undefined;
    this.projectDoc = undefined;
  }

  private refreshSummary() {
    this.summary.answered = 0;
    this.summary.read = 0;
    this.summary.unread = 0;
    if (this.questionsQuery != null) {
      for (const questionDoc of this.questionsQuery.docs) {
        if (CheckingUtils.hasUserAnswered(questionDoc.data, this.userService.currentUserId)) {
          this.summary.answered++;
        } else if (
          this.projectUserConfigDoc != null &&
          CheckingUtils.hasUserReadQuestion(questionDoc.data, this.projectUserConfigDoc.data)
        ) {
          this.summary.read++;
        } else {
          this.summary.unread++;
        }
      }
    }
  }

  private startUserOnboardingTour() {
    if (this.projectDoc == null || this.projectDoc.data == null || this.userDoc == null || this.userDoc.data == null) {
      return;
    }

    // HelpHero user-onboarding tour setup
    const isDiscussionEnabled: boolean = this.projectDoc.data.checkingConfig.usersSeeEachOthersResponses;
    const isInvitingEnabled: boolean = this.projectDoc.data.checkingConfig.shareEnabled;
    const isNameConfirmed = this.userDoc.data.isDisplayNameConfirmed;

    this.helpHeroService.setProperty({
      isAdmin: this.isProjectAdmin,
      isDiscussionEnabled,
      isInvitingEnabled,
      isNameConfirmed
    });
  }

  private getCSSFloatPropertyOf(element: ElementRef | Element, propertyName: string): number {
    const elementStyle: CSSStyleDeclaration = getComputedStyle(
      element instanceof ElementRef ? element.nativeElement : element
    );
    return parseFloat(elementStyle.getPropertyValue(propertyName));
  }

  /** Get float property without units. eg 3.14 instead of '3.14px'. */
  private getCSSFloatProperty(baseElement: ElementRef, elementSelector: string, propertyName: string): number {
    const element: Element | null = baseElement.nativeElement.querySelector(elementSelector);
    if (element == null) {
      return 0;
    }
    return this.getCSSFloatPropertyOf(element, propertyName);
  }

  private getOffsetHeight(baseElement: ElementRef, selector: string): number {
    const element: HTMLElement | null = baseElement.nativeElement.querySelector(selector);
    return element == null ? 0 : element.offsetHeight;
  }

  /** Report the needed height in px to fit contents without scrolling.
   * An element's `scrollHeight` may be taller than needed,
   * if the `clientHeight` of the scrollable area is already
   * taller than needed to fit the contents without
   * scrolling. */
  private getMinScrollHeight(baseElement: ElementRef, selector: string): number {
    const element = baseElement.nativeElement.querySelector(selector) as Element | null;
    if (element == null || element.firstElementChild == null || element.lastElementChild == null) {
      return 0;
    }

    return (
      element.lastElementChild!.getBoundingClientRect().bottom - element.firstElementChild!.getBoundingClientRect().top
    );
  }
}
