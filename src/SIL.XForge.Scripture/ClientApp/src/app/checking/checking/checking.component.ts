import { MdcList } from '@angular-mdc/web/list';
import { MdcMenuSelectedEvent } from '@angular-mdc/web/menu';
import { Component, ElementRef, HostBinding, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { MediaChange, MediaObserver } from '@angular/flex-layout';
import { ActivatedRoute, Router } from '@angular/router';
import { SplitComponent } from 'angular-split';
import cloneDeep from 'lodash-es/cloneDeep';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { Answer, AnswerStatus } from 'realtime-server/lib/esm/scriptureforge/models/answer';
import { Comment } from 'realtime-server/lib/esm/scriptureforge/models/comment';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { toVerseRef } from 'realtime-server/lib/esm/scriptureforge/models/verse-ref-data';
import { Canon } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/canon';
import { VerseRef } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/verse-ref';
import { merge, Subscription } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { I18nService } from 'xforge-common/i18n.service';
import { FileType } from 'xforge-common/models/file-offline-data';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { PwaService } from 'xforge-common/pwa.service';
import { UserService } from 'xforge-common/user.service';
import { objectId } from 'xforge-common/utils';
import { MatDialogConfig, MatDialogRef } from '@angular/material/dialog';
import { DialogService } from 'xforge-common/dialog.service';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { QuestionDoc } from '../../core/models/question-doc';
import { SF_DEFAULT_SHARE_ROLE } from '../../core/models/sf-project-role-info';
import { SFProjectUserConfigDoc } from '../../core/models/sf-project-user-config-doc';
import { TextDocId } from '../../core/models/text-doc';
import { TextsByBookId } from '../../core/models/texts-by-book-id';
import { SFProjectService } from '../../core/sf-project.service';
import {
  ScriptureChooserDialogComponent,
  ScriptureChooserDialogData
} from '../../scripture-chooser-dialog/scripture-chooser-dialog.component';
import { CheckingAccessInfo, CheckingUtils } from '../checking.utils';
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

export enum QuestionFilter {
  None,
  CurrentUserHasAnswered,
  CurrentUserHasNotAnswered,
  HasAnswers,
  NoAnswers,
  StatusNone,
  StatusExport,
  StatusResolved
}

@Component({
  selector: 'app-checking',
  templateUrl: './checking.component.html',
  styleUrls: ['./checking.component.scss']
})
export class CheckingComponent extends DataLoadingComponent implements OnInit, OnDestroy {
  @ViewChild('answerPanelContainer') set answersPanelElement(answersPanelContainerElement: ElementRef) {
    // Need to trigger the calculation for the slider after DOM has been updated
    this.answersPanelContainerElement = answersPanelContainerElement;
    this.calculateScriptureSliderPosition(true);
  }
  @HostBinding('class') classes = 'flex-max';
  @ViewChild(CheckingAnswersComponent) answersPanel?: CheckingAnswersComponent;
  @ViewChild(CheckingTextComponent) scripturePanel?: CheckingTextComponent;
  @ViewChild(CheckingQuestionsComponent) questionsPanel?: CheckingQuestionsComponent;
  @ViewChild(SplitComponent) splitComponent?: SplitComponent;
  @ViewChild('splitContainer') splitContainerElement?: ElementRef;
  @ViewChild('scripturePanelContainer') scripturePanelContainerElement?: ElementRef;
  @ViewChild('chapterMenuList') chapterMenuList?: MdcList;

  chapters: number[] = [];
  isExpanded: boolean = false;
  scriptureFontSize: string = '';
  showAllBooks: boolean = false;
  summary: Summary = {
    read: 0,
    unread: 0,
    answered: 0
  };
  questionFilters: Map<QuestionFilter, string> = new Map<QuestionFilter, string>();
  questionFilterSelected: QuestionFilter = QuestionFilter.None;
  questionVerseRefs: VerseRef[] = [];
  answersPanelContainerElement?: ElementRef;
  projectDoc?: SFProjectProfileDoc;
  projectUserConfigDoc?: SFProjectUserConfigDoc;
  textDocId?: TextDocId;
  totalVisibleQuestionsString: string = '0';
  userDoc?: UserDoc;
  visibleQuestions?: QuestionDoc[];

  private _book?: number;
  private _isDrawerPermanent: boolean = true;
  private _chapter?: number;
  private questionsQuery?: RealtimeQuery<QuestionDoc>;
  private _activeQuestionVerseRef?: VerseRef;
  private questionsSub?: Subscription;
  private projectDeleteSub?: Subscription;
  private projectRemoteChangesSub?: Subscription;
  private questionFilterFunctions: Record<QuestionFilter, (answers: Answer[]) => boolean> = {
    [QuestionFilter.None]: () => true,
    [QuestionFilter.CurrentUserHasNotAnswered]: answers =>
      !answers.some(a => a.ownerRef === this.userService.currentUserId),
    [QuestionFilter.CurrentUserHasAnswered]: answers =>
      answers.some(a => a.ownerRef === this.userService.currentUserId),
    [QuestionFilter.HasAnswers]: answers => answers.length > 0,
    [QuestionFilter.NoAnswers]: answers => answers.length === 0,
    [QuestionFilter.StatusNone]: answers => answers.some(a => a.status === AnswerStatus.None || a.status == null),
    [QuestionFilter.StatusExport]: answers => answers.some(a => a.status === AnswerStatus.Exportable),
    [QuestionFilter.StatusResolved]: answers => answers.some(a => a.status === AnswerStatus.Resolved)
  };
  private questionsRemoteChangesSub?: Subscription;
  private text?: TextInfo;
  private isProjectAdmin: boolean = false;

  constructor(
    private readonly activatedRoute: ActivatedRoute,
    private readonly projectService: SFProjectService,
    private readonly userService: UserService,
    private readonly media: MediaObserver,
    private readonly dialogService: DialogService,
    noticeService: NoticeService,
    private readonly router: Router,
    private readonly questionDialogService: QuestionDialogService,
    readonly i18n: I18nService,
    private readonly pwaService: PwaService
  ) {
    super(noticeService);
  }

  get activeQuestionVerseRef(): VerseRef | undefined {
    if (this.questionsPanel != null && this.book === this.questionsPanel.activeQuestionBook) {
      return this._activeQuestionVerseRef;
    }
    return undefined;
  }

  get appliedQuestionFilterKey(): string {
    return this.questionFilters.get(this.questionFilterSelected)!;
  }

  get bookName(): string {
    return this.text == null ? '' : this.i18n.localizeBook(this.text.bookNum);
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

  get isQuestionFilterApplied(): boolean {
    return this.questionFilterSelected !== QuestionFilter.None;
  }

  get canCreateQuestions(): boolean {
    const project = this.projectDoc?.data;
    return (
      project != null &&
      SF_PROJECT_RIGHTS.hasRight(project, this.userService.currentUserId, SFProjectDomain.Questions, Operation.Create)
    );
  }

  get isRightToLeft(): boolean {
    if (this.projectDoc?.data?.isRightToLeft != null) {
      return this.projectDoc.data.isRightToLeft;
    }
    return false;
  }

  get questionDocs(): Readonly<QuestionDoc[]> {
    return this.questionsQuery?.docs || [];
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

  get routerLink(): string[] {
    if (this.projectDoc == null) {
      return [];
    }
    return ['/projects', this.projectDoc.id, 'checking'];
  }

  get defaultShareRole(): SFProjectRole {
    return SF_DEFAULT_SHARE_ROLE;
  }

  get canShare(): boolean {
    return this.isProjectAdmin || this.projectDoc?.data?.checkingConfig.shareEnabled === true;
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
      book = undefined;
      if (this.questionsPanel != null) {
        const question = this.questionsPanel.activateStoredQuestion(questionDocs);
        if (question.data != null) {
          book = question.data.verseRef.bookNum;
        }
      }
    }
    this._book = book;
    this.text = this.projectDoc.data.texts.find(t => t.bookNum === book);
    this.chapters = this.text == null ? [] : this.text.chapters.map(c => c.number);
    this._chapter = undefined;
    if (this.questionsPanel != null) {
      this.chapter = this.questionsPanel.activeQuestionChapter;
    }
    this.triggerUpdate();
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

    const scrollPartHeight = this.getMinScrollHeight(
      this.answersPanelContainerElement,
      '.answers-component-scrollable-content'
    );

    const showUnreadsBannerHeight = this.getOffsetHeight(
      this.answersPanelContainerElement,
      '.answers-component-footer'
    );

    // In Chromium the audio elements usually haven't rendered at this point, or have only partially rendered, though
    // they are in the DOM
    // If an audio element exists and the height is less than expected, add the difference to the calculation
    // The same is done for the answer footer, since the avatar sometimes hasn't contributed to the height yet
    const answerPanel = this.answersPanelContainerElement.nativeElement as HTMLElement;
    const expectedAudioHeight = 58;
    const audioOffsetHeight = Array.from(
      answerPanel.querySelectorAll('.question-audio app-checking-audio-player, .answer app-checking-audio-player')
    )
      .map((audio: Element) => {
        if (audio.getBoundingClientRect().height < expectedAudioHeight) {
          return (
            expectedAudioHeight -
            audio.getBoundingClientRect().height +
            (audio.parentElement ? this.getCSSFloatPropertyOf(audio.parentElement, 'margin-bottom') : 0)
          );
        } else {
          return 0;
        }
      })
      .reduce((a, b) => a + b, 0);

    const expectedFooterHeight = 38;
    // app-owner is the element that ends up determining the height of the footer
    const footerOffsetHeight = Array.from(answerPanel.querySelectorAll('.answer-footer app-owner'))
      .map(footer => footer as HTMLElement)
      .map(footer => (footer.offsetHeight < expectedFooterHeight ? expectedFooterHeight - footer.offsetHeight : 0))
      .reduce((a, b) => a + b, 0);

    return (
      answersPanelVerticalPadding + scrollPartHeight + audioOffsetHeight + footerOffsetHeight + showUnreadsBannerHeight
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
    const distanceFromTopToAddAnswerButtonBottom =
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
      Math.max(distanceFromTopToTotalAnswersMessageBottom, distanceFromTopToAddAnswerButtonBottom) +
      answersPanelVerticalPadding +
      showUnreadsBannerHeight
    );
  }

  private get minAnswerPanelPercent(): number {
    return Math.ceil((this.answerPanelElementMinimumHeight / this.splitContainerElementHeight) * 100);
  }
  private get fullyExpandedAnswerPanelPercent(): number {
    return Math.ceil((this.fullyExpandedAnswerPanelHeight / this.splitContainerElementHeight) * 100);
  }

  private get splitContainerElementHeight(): number {
    return this.splitContainerElement && this.splitComponent
      ? this.splitContainerElement.nativeElement.offsetHeight - this.splitComponent.gutterSize!
      : 0;
  }

  ngOnInit(): void {
    this.subscribe(this.activatedRoute.params, async params => {
      this.loadingStarted();
      const projectId = params['projectId'] as string;
      const bookId = params['bookId'] as string;
      const prevProjectId = this.projectDoc == null ? '' : this.projectDoc.id;
      this.projectDoc = await this.projectService.getProfile(projectId);
      if (!this.projectDoc.isLoaded) {
        return;
      }
      const bookNum = bookId == null ? 0 : Canon.bookIdToNumber(bookId);
      this.projectUserConfigDoc = await this.projectService.getUserConfig(projectId, this.userService.currentUserId);
      if (prevProjectId !== this.projectDoc.id || this.book !== bookNum || (bookId !== 'ALL' && this.showAllBooks)) {
        if (this.questionsQuery != null) {
          this.questionsQuery.dispose();
        }
        const prevShowAllBooks = this.showAllBooks;
        this.showAllBooks = bookId === 'ALL';
        this.questionsQuery = await this.projectService.queryQuestions(projectId, {
          bookNum: this.showAllBooks ? undefined : bookNum,
          sort: true,
          activeOnly: true
        });
        // TODO: check for remote changes to file data more generically
        if (this.questionsRemoteChangesSub != null) {
          this.questionsRemoteChangesSub.unsubscribe();
        }
        this.questionsRemoteChangesSub = this.subscribe(this.questionsQuery.remoteDocChanges$, (qd: QuestionDoc) => {
          const isActiveQuestionDoc = qd.id === this.questionsPanel!.activeQuestionDoc?.id;
          if (isActiveQuestionDoc) {
            this.updateActiveQuestionVerseRef(qd);
          }
          if (this.pwaService.isOnline) {
            qd.updateFileCache();
            if (isActiveQuestionDoc) {
              qd.updateAnswerFileCache();
            }
          }
        });
        if (this.questionsSub != null) {
          this.questionsSub.unsubscribe();
        }
        const prevBook = this.book;
        this.book = bookNum;
        this.questionsSub = this.subscribe(
          merge(
            this.questionsQuery.ready$,
            this.questionsQuery.remoteChanges$,
            this.questionsQuery.localChanges$,
            this.questionsQuery.remoteDocChanges$
          ),
          () => this.updateQuestionRefsOrRedirect()
        );
        this.userDoc = await this.userService.getCurrentUser();
        // refresh the summary when switching between all questions and the current book
        if (this.showAllBooks !== prevShowAllBooks && this.book === prevBook) {
          this.refreshSummary();
        }
        this.loadingFinished();
      }
      // Subscribe to the projectDoc now that it is defined
      if (this.projectRemoteChangesSub != null) {
        this.projectRemoteChangesSub.unsubscribe();
      }
      this.projectRemoteChangesSub = this.subscribe(this.projectDoc.remoteChanges$, () => {
        if (this.projectDoc != null && this.projectDoc.data != null) {
          if (!(this.userService.currentUserId in this.projectDoc.data.userRoles)) {
            this.onRemovedFromProject();
          } else if (!this.projectDoc.data.checkingConfig.checkingEnabled) {
            const currentBookId =
              this.questionsPanel == null || this.questionsPanel.activeQuestionBook == null
                ? undefined
                : Canon.bookNumberToId(this.questionsPanel.activeQuestionBook);
            if (this.projectUserConfigDoc != null) {
              const checkingAccessInfo: CheckingAccessInfo = {
                userId: this.userService.currentUserId,
                projectId: this.projectDoc.id,
                project: this.projectDoc.data,
                bookId: currentBookId,
                projectUserConfigDoc: this.projectUserConfigDoc!
              };
              CheckingUtils.onAppAccessRemoved(checkingAccessInfo, this.router, this.noticeService);
              this.onRemovedFromProject();
            }
          }
        }
      });
      if (this.projectDeleteSub != null) {
        this.projectDeleteSub.unsubscribe();
      }
      this.projectDeleteSub = this.subscribe(this.projectDoc.delete$, () => this.onRemovedFromProject());
      this.isProjectAdmin = await this.projectService.isProjectAdmin(projectId, this.userService.currentUserId);
      this.initQuestionFilters();
    });
    this.subscribe(
      this.media.asObservable().pipe(
        filter((changes: MediaChange[]) => changes.length > 0),
        map((changes: MediaChange[]) => changes[0])
      ),
      (change: MediaChange) => {
        this.calculateScriptureSliderPosition();
        this.isDrawerPermanent = ['xl', 'lt-xl', 'lg', 'lt-lg', 'md', 'lt-md'].includes(change.mqAlias);
      }
    );
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
    if (this.questionsQuery != null) {
      this.questionsQuery.dispose();
    }
  }

  applyFontChange(fontSize: string) {
    this.scriptureFontSize = fontSize;
  }

  async answerAction(answerAction: AnswerAction): Promise<void> {
    if (this.projectDoc == null || this.questionsPanel == null) {
      return;
    }

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
            comments: [],
            status: AnswerStatus.None
          };
        }
        answer.text = answerAction.text;
        answer.scriptureText = answerAction.scriptureText;
        answer.verseRef = answerAction.verseRef;
        answer.selectionStartClipped = answerAction.selectionStartClipped;
        answer.selectionEndClipped = answerAction.selectionEndClipped;
        answer.dateModified = dateNow;
        if (answerAction.audio != null) {
          if (answerAction.audio.fileName != null && answerAction.audio.blob != null) {
            if (answerAction.questionDoc != null) {
              // Get the amended filename and save it against the answer
              const urlResult = await answerAction.questionDoc.uploadFile(
                FileType.Audio,
                answer.dataId,
                answerAction.audio.blob,
                answerAction.audio.fileName
              );
              if (urlResult == null) {
                break;
              }
              answer.audioUrl = urlResult;
            }
          } else if (answerAction.audio.status === 'reset') {
            answer.audioUrl = undefined;
          }
        }
        this.saveAnswer(answer, answerAction.questionDoc);
        if (answerAction.savedCallback != null) {
          answerAction.savedCallback();
        }
        break;
      case 'delete':
        if (answerAction.answer != null) {
          this.deleteAnswer(answerAction.answer);
        }
        break;
      case 'edit':
        if (answerAction.questionDoc != null) {
          this.questionsPanel.activateQuestion(answerAction.questionDoc);
        }
        this.triggerUpdate();
        break;
      case 'archive':
        this.triggerUpdate();
        break;
      case 'like':
        if (answerAction.answer != null) {
          this.likeAnswer(answerAction.answer);
        }
        break;
      case 'show-unread':
        // Emit the question doc so that answers and comments get marked as read
        this.questionsPanel.activeQuestionDoc$.next(this.questionsPanel.activeQuestionDoc);
        break;
      case 'show-form':
        break;
      case 'hide-form':
        break;
      case 'status':
        this.saveAnswer(answerAction.answer!, answerAction.questionDoc);
        break;
    }
    this.calculateScriptureSliderPosition(true);
  }

  collapseDrawer(): void {
    this.isExpanded = false;
  }

  openDrawer(): void {
    this.isExpanded = true;
  }

  toggleDrawer(): void {
    this.isExpanded = !this.isExpanded;
  }

  drawerCollapsed(): void {
    this.isExpanded = false;
  }

  chapterMenuOpened(): void {
    // Focus is lost when the menu closes so need to set it again
    // Need to wait for DOM to update as we can't set the focus until it is visible and no built in method
    setTimeout(() => {
      if (this.chapterMenuList != null && this._chapter != null) {
        this.chapterMenuList.focusItemAtIndex(this._chapter - 1);
      }
    }, 10);
  }

  commentAction(commentAction: CommentAction): void {
    if (this.questionsPanel == null) {
      return;
    }

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
                if (!this.questionsPanel!.hasUserReadComment(comm)) {
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
        break;
      case 'hide-form':
        break;
    }
    this.calculateScriptureSliderPosition(true);
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
    const dialogConfig: MatDialogConfig<ScriptureChooserDialogData> = {
      data: { booksAndChaptersToShow: this.textsByBookId, includeVerseSelection: false }
    };

    const dialogRef = this.dialogService.openMatDialog(ScriptureChooserDialogComponent, dialogConfig) as MatDialogRef<
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

  questionUpdated(_questionDoc: QuestionDoc): void {
    this.refreshSummary();
  }

  questionChanged(questionDoc: QuestionDoc): void {
    if (this.questionsPanel == null) {
      return;
    }

    this.book = questionDoc.data?.verseRef.bookNum;
    this.chapter = this.questionsPanel.activeQuestionChapter;
    this.updateActiveQuestionVerseRef(questionDoc);
    this.calculateScriptureSliderPosition(true);
    this.refreshSummary();
    this.collapseDrawer();
    if (this.pwaService.isOnline) {
      questionDoc.updateAnswerFileCache();
    }
  }

  async questionDialog(): Promise<void> {
    if (this.projectDoc == null || this.questionsPanel == null) {
      return;
    }

    const data: QuestionDialogData = {
      questionDoc: undefined,
      textsByBookId: this.textsByBookId,
      projectId: this.projectDoc.id,
      defaultVerse: new VerseRef(this.book, this.chapter, 1),
      isRightToLeft: this.projectDoc.data?.isRightToLeft
    };
    const newQuestion = await this.questionDialogService.questionDialog(data);
    if (newQuestion != null) {
      this.setQuestionFilter(QuestionFilter.None);
      this.questionsPanel.activateQuestion(newQuestion);
    }
  }

  setQuestionFilter(filter: QuestionFilter): void {
    this.questionFilterSelected = filter;
    this.updateVisibleQuestions();
  }

  totalQuestions(): number {
    return this.questionDocs.length;
  }

  totalVisibleQuestions(): number {
    return (this.visibleQuestions ?? []).length;
  }

  verseRefClicked(verseRef: VerseRef): void {
    if (this.questionsPanel == null) {
      return;
    }

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

  private triggerUpdate() {
    if (this.questionsQuery != null) {
      this.questionsQuery.localUpdate();
    }
  }

  /**
   * Checks whether the user should be redirected to another page and does so if necessary. For example, redirect if the
   * only question was deleted, or the book is invalid, or the user added a question to a book other than the currently
   * active book.
   * If no redirect is necessary, updates the list of verse refs to show in the text doc.
   * This method assumes any local data in IndexedDB has already been loaded into this.questionQuery
   */
  private updateQuestionRefsOrRedirect(): void {
    if (
      this.projectDoc == null ||
      this.questionsQuery == null ||
      (this.pwaService.isOnline && !this.questionsQuery.ready)
    ) {
      return;
    }
    this.updateVisibleQuestions();
    if (this.totalQuestions() === 0) {
      this.router.navigate(['/projects', this.projectDoc.id, 'checking'], {
        replaceUrl: true
      });
      return;
    } else if (this.showAllBooks) {
      const availableBooks = new Set<string>();
      for (const questionDoc of this.visibleQuestions ?? []) {
        const questionVerseRef = questionDoc.data == null ? undefined : toVerseRef(questionDoc.data.verseRef);
        if (questionVerseRef != null && !availableBooks.has(questionVerseRef.book)) {
          availableBooks.add(questionVerseRef.book);
        }
      }
      if (availableBooks.size === 1) {
        this.router.navigate(['/projects', this.projectDoc.id, 'checking', availableBooks.values().next().value], {
          replaceUrl: true
        });
        return;
      }
    }
    if (
      !this.showAllBooks &&
      this.book != null &&
      this.questionsPanel != null &&
      this.questionsPanel.activeQuestionBook != null &&
      Canon.bookNumberToId(this.book) !== this.activatedRoute.snapshot.params['bookId']
    ) {
      this._book = undefined;
      this.router.navigate([
        '/projects',
        this.projectDoc.id,
        'checking',
        Canon.bookNumberToId(this.questionsPanel.activeQuestionBook)
      ]);
    }
  }

  private updateQuestionRefs(): void {
    // Only pass in relevant verse references to the text component
    const questionVerseRefs: VerseRef[] = [];
    for (const questionDoc of this.visibleQuestions ?? []) {
      const questionVerseRef = questionDoc.data == null ? undefined : toVerseRef(questionDoc.data.verseRef);
      if (questionVerseRef != null && questionVerseRef.bookNum === this.book) {
        questionVerseRefs.push(questionVerseRef);
      }
    }
    this.questionVerseRefs = questionVerseRefs;
  }

  private updateVisibleQuestions(): void {
    let matchingQuestions: QuestionDoc[];
    // If there is no filter applied, avoid allocating a new array of questions
    if (this.questionFilterSelected === QuestionFilter.None) matchingQuestions = this.questionDocs.map(q => q);
    else {
      const filterFunction = this.questionFilterFunctions[this.questionFilterSelected];
      matchingQuestions = this.questionDocs.filter(q => (q.data == null ? false : filterFunction(q.data.answers)));
    }
    this.visibleQuestions = matchingQuestions;
    if (this.totalQuestions() === this.totalVisibleQuestions()) {
      this.totalVisibleQuestionsString = this.totalQuestions().toString();
    } else {
      this.totalVisibleQuestionsString = `${this.totalVisibleQuestions()}/${this.totalQuestions()}`;
    }
    this.updateQuestionRefs();
    this.refreshSummary();
  }

  private getAnswerIndex(answer: Answer): number {
    if (this.questionsPanel == null) {
      return -1;
    }
    const activeQuestionDoc = this.questionsPanel.activeQuestionDoc;
    return activeQuestionDoc == null || activeQuestionDoc.data == null
      ? -1
      : activeQuestionDoc.data.answers.findIndex(existingAnswer => existingAnswer.dataId === answer.dataId);
  }

  private deleteAnswer(answer: Answer): void {
    if (this.questionsPanel == null) {
      return;
    }
    const activeQuestionDoc = this.questionsPanel.activeQuestionDoc;
    if (activeQuestionDoc == null) {
      return;
    }
    const answerIndex = this.getAnswerIndex(answer);
    if (answerIndex >= 0) {
      activeQuestionDoc
        .submitJson0Op(op => op.remove(q => q.answers, answerIndex))
        .then(() => {
          if (this.projectDoc != null) {
            activeQuestionDoc.deleteFile(FileType.Audio, answer.dataId, answer.ownerRef);
          }
        });
      this.refreshSummary();
    }
  }

  private saveAnswer(answer: Answer, questionDoc: QuestionDoc | undefined): void {
    if (this.questionsPanel == null || questionDoc?.data == null) {
      return;
    }
    const answers = cloneDeep(questionDoc.data.answers);
    const answerIndex = this.getAnswerIndex(answer);
    if (answerIndex >= 0) {
      answers[answerIndex] = answer;
    } else {
      answers.unshift(answer);
    }
    if (answerIndex >= 0) {
      const oldAnswer = questionDoc.data.answers[answerIndex];
      const newAnswer = answers[answerIndex];
      const deleteAudio = oldAnswer.audioUrl != null && newAnswer.audioUrl == null;
      const submitPromise = questionDoc.submitJson0Op(op =>
        op
          .set(q => q.answers[answerIndex].text, newAnswer.text)
          .set(q => q.answers[answerIndex].scriptureText, newAnswer.scriptureText)
          .set(q => q.answers[answerIndex].verseRef, newAnswer.verseRef)
          .set(q => q.answers[answerIndex].selectionStartClipped, newAnswer.selectionStartClipped)
          .set(q => q.answers[answerIndex].selectionEndClipped, newAnswer.selectionEndClipped)
          .set(q => q.answers[answerIndex].audioUrl, newAnswer.audioUrl)
          .set(q => q.answers[answerIndex].status, newAnswer.status)
          .set(q => q.answers[answerIndex].dateModified, newAnswer.dateModified)
      );
      if (deleteAudio) {
        submitPromise.then(() => {
          if (this.projectDoc != null) {
            questionDoc.deleteFile(FileType.Audio, oldAnswer.dataId, oldAnswer.ownerRef);
          }
        });
      }
    } else {
      questionDoc.submitJson0Op(op => op.insert(q => q.answers, 0, answers[0]));
    }
    questionDoc.updateAnswerFileCache();
    this.questionsPanel.updateElementsRead(questionDoc);
    this.refreshSummary();
  }

  private saveComment(answer: Answer, comment: Comment): void {
    if (this.questionsPanel == null) {
      return;
    }
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
    if (this.questionsPanel == null) {
      return;
    }
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

  private likeAnswer(answer: Answer): void {
    if (this.questionsPanel == null) {
      return;
    }
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

  private updateActiveQuestionVerseRef(questionDoc: QuestionDoc): void {
    this._activeQuestionVerseRef = questionDoc.data == null ? undefined : toVerseRef(questionDoc.data.verseRef);
  }

  private calculateScriptureSliderPosition(maximizeAnswerPanel: boolean = false): void {
    const waitMs: number = 100;
    // Wait while Angular updates visible DOM elements before we can calculate the height correctly
    setTimeout(() => {
      if (this.splitComponent == null) {
        return;
      }

      let answerPanelHeight: number;
      if (maximizeAnswerPanel) {
        answerPanelHeight = this.fullyExpandedAnswerPanelPercent;
      } else {
        answerPanelHeight = this.minAnswerPanelPercent;
      }

      answerPanelHeight = Math.min(75, answerPanelHeight);
      const scripturePanelHeight = 100 - answerPanelHeight;
      this.splitComponent.setVisibleAreaSizes([scripturePanelHeight, answerPanelHeight]);
    }, waitMs);
  }

  // Unbind this component from the data when a user is removed from the project, otherwise console
  // errors appear before the app can navigate to the start component
  private onRemovedFromProject(): void {
    if (this.questionsPanel != null) {
      this.questionsPanel.activeQuestionDoc = undefined;
    }
    this.projectUserConfigDoc = undefined;
    if (this.questionsQuery != null) {
      this.questionsQuery.dispose();
    }
    this.questionsQuery = undefined;
    this.projectDoc = undefined;
  }

  private refreshSummary(): void {
    this.summary.answered = 0;
    this.summary.read = 0;
    this.summary.unread = 0;
    for (const questionDoc of this.visibleQuestions ?? []) {
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

  private getCSSFloatPropertyOf(element: ElementRef | Element, propertyName: string): number {
    const elementStyle: CSSStyleDeclaration = getComputedStyle(
      element instanceof ElementRef ? element.nativeElement : element
    );
    return parseFloat(elementStyle.getPropertyValue(propertyName));
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

  private initQuestionFilters(): void {
    if (this.projectDoc?.data == null) {
      return;
    }
    this.questionFilters.clear();
    this.questionFilters.set(QuestionFilter.None, 'question_filter_none');
    if (
      SF_PROJECT_RIGHTS.hasRight(
        this.projectDoc.data,
        this.userService.currentUserId,
        SFProjectDomain.AnswerStatus,
        Operation.Edit
      )
    ) {
      this.questionFilters
        .set(QuestionFilter.HasAnswers, 'question_filter_has_answers')
        .set(QuestionFilter.NoAnswers, 'question_filter_no_answers')
        .set(QuestionFilter.StatusExport, 'question_filter_exportable')
        .set(QuestionFilter.StatusResolved, 'question_filter_resolved')
        .set(QuestionFilter.StatusNone, 'question_filter_not_reviewed');
    } else {
      this.questionFilters
        .set(QuestionFilter.CurrentUserHasAnswered, 'question_filter_answered')
        .set(QuestionFilter.CurrentUserHasNotAnswered, 'question_filter_not_answered');
    }
  }
}
