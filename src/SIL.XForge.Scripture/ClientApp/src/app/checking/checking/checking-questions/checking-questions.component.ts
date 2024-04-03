import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  QueryList,
  SimpleChanges,
  ViewChildren
} from '@angular/core';
import { MatLegacyListItem as MatListItem } from '@angular/material/legacy-list';
import sortBy from 'lodash-es/sortBy';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { Answer } from 'realtime-server/lib/esm/scriptureforge/models/answer';
import { Comment } from 'realtime-server/lib/esm/scriptureforge/models/comment';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectDomain, SF_PROJECT_RIGHTS } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { SFProjectUserConfig } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config';
import { toVerseRef, VerseRefData } from 'realtime-server/lib/esm/scriptureforge/models/verse-ref-data';
import { Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { I18nService } from 'xforge-common/i18n.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { UserService } from 'xforge-common/user.service';
import { QuestionDoc } from '../../../core/models/question-doc';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { SFProjectUserConfigDoc } from '../../../core/models/sf-project-user-config-doc';
import { SFProjectService } from '../../../core/sf-project.service';
import { TranslationEngineService } from '../../../core/translation-engine.service';
import { BookChapter, bookChapterMatchesVerseRef, CheckingUtils } from '../../checking.utils';

export interface QuestionChangeActionSource {
  /** True during events due to a questions doc change such as with a filter. */
  isQuestionListChange?: boolean;
}
export interface QuestionChangedEvent {
  questionDoc: QuestionDoc | undefined;
  actionSource: QuestionChangeActionSource | undefined;
}

// For performance reasons, this component uses the OnPush change detection strategy rather than the default change
// detection strategy. This means when change detection runs, this component will be skipped during change detection
// until:
// 1. One of the @Input values is no longer equal to its previous value. Primitives are compared by value, objects by
// reference. So an array that has elements added or an observable that has emitted a value is not changed.
// 2. An event originates from the component or its children
// 3. The component calls changeDetector.markForCheck()
// There are a few other things that can trigger it. See the Angular documentation for details.
// Calling markForCheck() does not trigger change detection like detectChanges(). It merely indicates that at the next
// time change detection is run, this component should be checked for changes instead of being skipped.

@Component({
  selector: 'app-checking-questions',
  templateUrl: './checking-questions.component.html',
  styleUrls: ['./checking-questions.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CheckingQuestionsComponent extends SubscriptionDisposable implements OnInit, OnChanges {
  @Output() update = new EventEmitter<QuestionDoc>();
  @Output() changed = new EventEmitter<QuestionChangedEvent>();
  @Input() isFiltered: boolean = false;

  /** The book/chapter from the route.  Stored question activation is constrained to this book/chapter. */
  @Input() routeBookChapter?: BookChapter;

  @Input()
  set projectProfileDoc(projectProfileDoc: SFProjectProfileDoc | undefined) {
    this.projectProfileDocChangesSubscription?.unsubscribe();
    this._projectProfileDoc = projectProfileDoc;
    if (projectProfileDoc == null) {
      return;
    }
    this.projectProfileDocChangesSubscription = this.subscribe(projectProfileDoc.changes$, () => {
      this.changeDetector.markForCheck();
      this.setProjectAdmin();
    });
    this.setProjectAdmin();
  }

  @Input()
  set projectUserConfigDoc(projectUserConfigDoc: SFProjectUserConfigDoc | undefined) {
    this.projectUserConfigDocChangesSubscription?.unsubscribe();
    this._projectUserConfigDoc = projectUserConfigDoc;
    if (projectUserConfigDoc != null) {
      this.projectUserConfigDocChangesSubscription = this.subscribe(projectUserConfigDoc.changes$, () => {
        this.changeDetector.markForCheck();
      });
    }
  }

  @Input()
  set questionDocs(questionDocs: Readonly<QuestionDoc[] | undefined>) {
    if (questionDocs == null) {
      return;
    }

    this._questionDocs = questionDocs;
  }

  // When the list of questions is hidden it has display: none applied, which prevents scrolling to the active question
  // The instant it becomes visible we scroll the active question into view
  @Input() set visible(value: boolean) {
    if (value) {
      this.scrollToActiveQuestion();
    }
  }

  @ViewChildren(MatListItem, { read: ElementRef }) questionListOptions?: QueryList<ElementRef>;

  activeQuestionDoc?: QuestionDoc;
  activeQuestionDoc$ = new Subject<QuestionDoc>();
  haveQuestionsLoaded: boolean = false;

  private _projectProfileDoc?: SFProjectProfileDoc;
  private _projectUserConfigDoc?: SFProjectUserConfigDoc;
  private _questionDocs: Readonly<QuestionDoc[]> = [];
  private isProjectAdmin: boolean = false;

  private projectProfileDocChangesSubscription?: Subscription;
  private projectUserConfigDocChangesSubscription?: Subscription;

  constructor(
    private readonly userService: UserService,
    private readonly translationEngineService: TranslationEngineService,
    private readonly changeDetector: ChangeDetectorRef,
    private readonly projectService: SFProjectService,
    private readonly i18n: I18nService
  ) {
    super();
  }

  ngOnInit(): void {
    // Only mark as read if it has been viewed for a set period of time and not an accidental click
    this.subscribe(this.activeQuestionDoc$.pipe(debounceTime(2000)), questionDoc => {
      this.updateElementsRead(questionDoc);
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Handle changes to questionDocs in ngOnChanges instead of setter to ensure other @Inputs are set
    // when 'activateStoredQuestion' is called, such as 'routeBookChapter'.
    const questionDocs: Readonly<QuestionDoc[] | undefined> = changes.questionDocs?.currentValue;
    if (questionDocs != null) {
      if (questionDocs.length > 0) {
        this.activateStoredQuestion({ isQuestionListChange: true });
      } else {
        this.activeQuestionDoc = undefined;
      }

      this.haveQuestionsLoaded = true;
      this.changed.emit({ questionDoc: this.activeQuestionDoc, actionSource: { isQuestionListChange: true } });
      this.changeDetector.markForCheck();
    }
  }

  get activeQuestionBook(): number | undefined {
    return this.activeQuestionDoc?.data == null ? undefined : this.activeQuestionDoc.data.verseRef.bookNum;
  }

  get activeQuestionChapter(): number | undefined {
    return this.activeQuestionDoc?.data == null ? undefined : this.activeQuestionDoc.data.verseRef.chapterNum;
  }

  get activeQuestionIndex(): number {
    if (this.activeQuestionDoc == null) {
      return -1;
    }
    const activeQuestionDocId = this.activeQuestionDoc.id;
    return this.questionDocs.findIndex(question => question.id === activeQuestionDocId);
  }

  get hasQuestions(): boolean {
    return this.questionDocs.length > 0;
  }

  get project(): SFProjectProfile | undefined {
    return this._projectProfileDoc?.data;
  }
  get projectId(): string | undefined {
    return this._projectProfileDoc?.id;
  }

  get questionDocs(): Readonly<QuestionDoc[]> {
    return this._questionDocs;
  }

  private get canAddAnswer(): boolean {
    const userId = this.userService.currentUserId;
    return (
      this.project != null &&
      SF_PROJECT_RIGHTS.hasRight(this.project, userId, SFProjectDomain.Answers, Operation.Create)
    );
  }

  getAnswers(questionDoc: QuestionDoc): Answer[] {
    if (questionDoc.data == null || this.project == null) {
      return [];
    }

    if (this.project.checkingConfig.usersSeeEachOthersResponses || !this.canAddAnswer || this.isProjectAdmin) {
      return questionDoc.getAnswers();
    } else {
      return questionDoc.getAnswers(this.userService.currentUserId);
    }
  }

  getUnreadAnswers(questionDoc: QuestionDoc): number {
    if (
      (this.canAddAnswer && !this.isProjectAdmin) ||
      this.project == null ||
      !this.project.checkingConfig.usersSeeEachOthersResponses
    ) {
      // Non-admin users will not see unread answers badge because it may be distracting
      return 0;
    }
    let unread = 0;
    for (const answer of this.getAnswers(questionDoc)) {
      if (!this.hasUserReadAnswer(answer)) {
        unread++;
      }
    }
    for (const answer of this.getAnswers(questionDoc)) {
      for (const comment of answer.comments.filter(c => !c.deleted)) {
        if (!this.hasUserReadComment(comment)) {
          unread++;
        }
      }
    }
    return unread;
  }

  /**
   * Activates the question that a user has most recently viewed if available
   */
  activateStoredQuestion(actionSource?: QuestionChangeActionSource): QuestionDoc {
    let questionToActivate: QuestionDoc | undefined;
    let activeQuestionDocId: string | undefined;

    if (this.activeQuestionDoc != null) {
      activeQuestionDocId = this.activeQuestionDoc.id;
    }

    if (activeQuestionDocId == null || !this.questionDocs.some(question => question.id === activeQuestionDocId)) {
      if (this._projectUserConfigDoc?.data != null) {
        const lastQuestionDocId: string | undefined = this._projectUserConfigDoc.data.selectedQuestionRef;

        if (lastQuestionDocId != null) {
          const lastQuestionDoc: QuestionDoc | undefined = this.questionDocs.find(qd => qd.id === lastQuestionDocId);

          if (lastQuestionDoc?.data != null) {
            const verseRef: VerseRefData = lastQuestionDoc.data.verseRef;

            // Constrain activation of stored question to route book/chapter
            if (this.routeBookChapter == null || bookChapterMatchesVerseRef(this.routeBookChapter, verseRef)) {
              questionToActivate = lastQuestionDoc;
            }
          }
        }
      }
    } else {
      questionToActivate = this.activeQuestionDoc;
    }

    // No stored question, so use first question within route book/chapter if available.
    // Otherwise use first question.
    if (questionToActivate == null) {
      questionToActivate =
        this.questionDocs.find(
          qd => this.routeBookChapter == null || bookChapterMatchesVerseRef(this.routeBookChapter, qd.data!.verseRef)
        ) ?? this.questionDocs[0];
    }

    this.activateQuestion(questionToActivate, actionSource);
    return questionToActivate;
  }

  updateElementsRead(questionDoc: QuestionDoc): void {
    if (this._projectUserConfigDoc == null) {
      return;
    }

    this._projectUserConfigDoc
      .submitJson0Op(op => {
        if (questionDoc != null && questionDoc.data != null && !this.hasUserReadQuestion(questionDoc)) {
          op.add(puc => puc.questionRefsRead, questionDoc.data.dataId);
        }
        if (this.hasUserAnswered(questionDoc) || !this.canAddAnswer || this.isProjectAdmin) {
          for (const answer of this.getAnswers(questionDoc)) {
            if (!this.hasUserReadAnswer(answer)) {
              op.add(puc => puc.answerRefsRead, answer.dataId);
            }
            const comments: Comment[] = sortBy(
              answer.comments.filter(c => !c.deleted),
              c => c.dateCreated
            );
            let readLimit = 3;
            if (comments.length > 3) {
              readLimit = 2;
            }
            let commentCount = 0;
            for (const comment of comments) {
              if (!this.hasUserReadComment(comment)) {
                op.add(puc => puc.commentRefsRead, comment.dataId);
              }
              commentCount++;
              if (commentCount === readLimit) {
                break;
              }
            }
          }
        }
      })
      .then(updated => {
        if (updated) {
          this.update.emit(questionDoc);
        }
      });
  }

  checkCanChangeQuestion(relativeIndex: number): boolean {
    return !!this.questionDocs[this.activeQuestionIndex + relativeIndex];
  }

  hasUserAnswered(questionDoc: QuestionDoc): boolean {
    return CheckingUtils.hasUserAnswered(questionDoc.data, this.userService.currentUserId);
  }

  hasUserReadQuestion(questionDoc: QuestionDoc): boolean {
    return CheckingUtils.hasUserReadQuestion(questionDoc.data, this._projectUserConfigDoc?.data);
  }

  hasUserReadAnswer(answer: Answer): boolean {
    const config: Readonly<SFProjectUserConfig> | undefined = this._projectUserConfigDoc?.data;
    return config != null && (config.answerRefsRead.includes(answer.dataId) || config.ownerRef === answer.ownerRef);
  }

  hasUserReadComment(comment: Comment): boolean {
    const config: Readonly<SFProjectUserConfig> | undefined = this._projectUserConfigDoc?.data;
    return config != null && (config.commentRefsRead.includes(comment.dataId) || config.ownerRef === comment.ownerRef);
  }

  nextQuestion(): void {
    this.changeQuestion(1);
  }

  previousQuestion(): void {
    this.changeQuestion(-1);
  }

  activateQuestion(questionDoc: QuestionDoc, actionSource?: QuestionChangeActionSource): void {
    const verseRef: VerseRefData | undefined = questionDoc.data?.verseRef;

    // The reason for the convoluted questionChanged logic is because the change needs to be emitted even if it's the
    // same question, but calling activeQuestionDoc$.next when the question is unchanged causes complicated test errors
    let questionChanged = true;
    if (this.activeQuestionDoc != null && this.activeQuestionDoc.id === questionDoc.id) {
      questionChanged = false;
    }

    this.activeQuestionDoc = questionDoc;

    if (verseRef != null) {
      this.storeMostRecentQuestion(verseRef.bookNum, verseRef.chapterNum).then(() => {
        // Only emit if not a filter to avoid duplicate emission, as an emit from filter is called elsewhere
        if (!actionSource?.isQuestionListChange) {
          this.changed.emit({ questionDoc, actionSource });
        }

        if (questionChanged) {
          this.activeQuestionDoc$.next(questionDoc);
        }
      });
    }

    setTimeout(() => this.scrollToActiveQuestion());
  }

  questionText(questionDoc: QuestionDoc): string {
    if (questionDoc?.data == null) return '';

    return questionDoc.data.text
      ? questionDoc.data.text
      : questionDoc.data.audioUrl != null
      ? this.referenceForDisplay(questionDoc)
      : '';
  }

  questionVerseRef(questionDoc: QuestionDoc): string {
    if (questionDoc?.data == null) return '';

    return this.i18n.localizeReference(toVerseRef(questionDoc.data.verseRef));
  }

  private scrollToActiveQuestion(): void {
    this.changeDetector.detectChanges();
    this.questionListOptions
      ?.find(opt => opt.nativeElement?.classList.contains('selected'))
      ?.nativeElement.scrollIntoView({ block: 'nearest' });
  }

  private changeQuestion(newDifferential: number): void {
    if (this.activeQuestionDoc && this.checkCanChangeQuestion(newDifferential)) {
      this.activateQuestion(this.questionDocs[this.activeQuestionIndex + newDifferential]);
    }
  }

  private referenceForDisplay(questionDoc: QuestionDoc): string {
    const verseRefData: VerseRefData | undefined = questionDoc?.data?.verseRef;
    return verseRefData ? this.i18n.localizeReference(toVerseRef(verseRefData)) : '';
  }

  private setProjectAdmin(): void {
    if (this.projectId == null) {
      return;
    }
    this.projectService.isProjectAdmin(this.projectId, this.userService.currentUserId).then(isProjectAdmin => {
      this.isProjectAdmin = isProjectAdmin;
    });
  }

  private async storeMostRecentQuestion(bookNum: number, chapterNum: number): Promise<void> {
    if (this._projectUserConfigDoc != null && this._projectUserConfigDoc.data != null) {
      const activeQuestionDoc = this.activeQuestionDoc;
      if (activeQuestionDoc != null && activeQuestionDoc.data != null) {
        if (
          this.project != null &&
          this.project.translateConfig.translationSuggestionsEnabled &&
          this.project.translateConfig.source !== undefined
        ) {
          await this.translationEngineService.trainSelectedSegment(
            this._projectUserConfigDoc.data,
            this.project.translateConfig.source.projectRef
          );
        }
        await this._projectUserConfigDoc.submitJson0Op(op => {
          op.set<string>(puc => puc.selectedTask!, 'checking');
          op.set(puc => puc.selectedQuestionRef!, activeQuestionDoc.id);
          op.set(puc => puc.selectedBookNum!, bookNum);
          op.set(puc => puc.selectedChapterNum!, chapterNum);
          op.unset(puc => puc.selectedSegment);
          op.unset(puc => puc.selectedSegmentChecksum!);
        });
      }
    }
  }
}
