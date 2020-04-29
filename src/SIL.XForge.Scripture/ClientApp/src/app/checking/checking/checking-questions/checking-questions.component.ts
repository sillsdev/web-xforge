import { Component, EventEmitter, Input, Output } from '@angular/core';
import sortBy from 'lodash/sortBy';
import { Operation } from 'realtime-server/lib/common/models/project-rights';
import { Answer } from 'realtime-server/lib/scriptureforge/models/answer';
import { Comment } from 'realtime-server/lib/scriptureforge/models/comment';
import { SFProject } from 'realtime-server/lib/scriptureforge/models/sf-project';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from 'realtime-server/lib/scriptureforge/models/sf-project-rights';
import { SFProjectRole } from 'realtime-server/lib/scriptureforge/models/sf-project-role';
import { toVerseRef } from 'realtime-server/lib/scriptureforge/models/verse-ref-data';
import { VerseRef } from 'realtime-server/lib/scriptureforge/scripture-utils/verse-ref';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { UserService } from 'xforge-common/user.service';
import { QuestionDoc } from '../../../core/models/question-doc';
import { SFProjectUserConfigDoc } from '../../../core/models/sf-project-user-config-doc';
import { SFProjectService } from '../../../core/sf-project.service';
import { CheckingUtils } from '../../checking.utils';

@Component({
  selector: 'app-checking-questions',
  templateUrl: './checking-questions.component.html',
  styleUrls: ['./checking-questions.component.scss']
})
export class CheckingQuestionsComponent extends SubscriptionDisposable {
  @Input() project?: SFProject;
  @Input() projectUserConfigDoc?: SFProjectUserConfigDoc;
  @Input() isAllBooksShown: boolean = false;
  @Output() update = new EventEmitter<QuestionDoc>();
  @Output() changed = new EventEmitter<QuestionDoc>();
  _questionDocs: Readonly<QuestionDoc[]> = [];
  activeQuestionDoc?: QuestionDoc;
  activeQuestionDoc$ = new Subject<QuestionDoc>();
  private _activeQuestionVerseRef?: VerseRef;

  constructor(private readonly userService: UserService, private readonly projectService: SFProjectService) {
    super();
    // Only mark as read if it has been viewed for a set period of time and not an accidental click
    this.subscribe(this.activeQuestionDoc$.pipe(debounceTime(2000)), questionDoc => {
      this.updateElementsRead(questionDoc);
    });
  }

  get activeQuestionBook(): number | undefined {
    return this.activeQuestionDoc == null || this.activeQuestionDoc.data == null
      ? undefined
      : this.activeQuestionDoc.data.verseRef.bookNum;
  }

  get activeQuestionChapter(): number | undefined {
    return this.activeQuestionDoc == null || this.activeQuestionDoc.data == null
      ? undefined
      : this.activeQuestionDoc.data.verseRef.chapterNum;
  }

  get activeQuestionIndex(): number {
    if (this.activeQuestionDoc == null) {
      return -1;
    }
    const activeQuestionDocId = this.activeQuestionDoc.id;
    return this.questionDocs.findIndex(question => question.id === activeQuestionDocId);
  }

  get activeQuestionVerseRef(): VerseRef | undefined {
    return this._activeQuestionVerseRef;
  }

  get questionDocs(): Readonly<QuestionDoc[]> {
    return this._questionDocs;
  }

  @Input() set questionDocs(questionDocs: Readonly<QuestionDoc[]>) {
    if (questionDocs.length > 0) {
      this.activateStoredQuestion(questionDocs);
    } else {
      this.activeQuestionDoc = undefined;
    }
    this._questionDocs = questionDocs;
  }

  private get canAddAnswer(): boolean {
    return SF_PROJECT_RIGHTS.hasRight(this.projectRole, {
      projectDomain: SFProjectDomain.Answers,
      operation: Operation.Create
    });
  }

  private get projectRole(): SFProjectRole {
    if (this.project == null || this.projectUserConfigDoc == null || this.projectUserConfigDoc.data == null) {
      return SFProjectRole.None;
    }
    return this.project.userRoles[this.projectUserConfigDoc.data.ownerRef] as SFProjectRole;
  }

  getAnswers(questionDoc: QuestionDoc): Answer[] {
    if (questionDoc.data == null || this.project == null) {
      return [];
    }

    if (this.project.checkingConfig.usersSeeEachOthersResponses || !this.canAddAnswer) {
      return questionDoc.data.answers;
    } else {
      return questionDoc.data.answers.filter(answer => answer.ownerRef === this.userService.currentUserId);
    }
  }

  getUnreadAnswers(questionDoc: QuestionDoc): number {
    if (this.canAddAnswer || this.project == null || !this.project.checkingConfig.usersSeeEachOthersResponses) {
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
      for (const comment of answer.comments) {
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
  activateStoredQuestion(questionDocs: Readonly<QuestionDoc[]>): QuestionDoc {
    let questionToActivate: QuestionDoc | undefined;
    let activeQuestionDocId: string | undefined;
    if (this.activeQuestionDoc != null) {
      activeQuestionDocId = this.activeQuestionDoc.id;
    }
    if (activeQuestionDocId == null || !questionDocs.some(question => question.id === activeQuestionDocId)) {
      if (this.projectUserConfigDoc != null && this.projectUserConfigDoc.data != null) {
        const lastQuestionDocId = this.projectUserConfigDoc.data.selectedQuestionRef;
        if (lastQuestionDocId != null) {
          questionToActivate = questionDocs.find(qd => qd.id === lastQuestionDocId);
        }
      }
    } else {
      return this.activeQuestionDoc!;
    }
    if (questionToActivate == null) {
      questionToActivate = questionDocs[0];
    }
    this.activateQuestion(questionToActivate);
    return questionToActivate;
  }

  updateElementsRead(questionDoc: QuestionDoc): void {
    if (this.projectUserConfigDoc == null) {
      return;
    }

    this.projectUserConfigDoc
      .submitJson0Op(op => {
        if (questionDoc != null && questionDoc.data != null && !this.hasUserReadQuestion(questionDoc)) {
          op.add(puc => puc.questionRefsRead, questionDoc.data.dataId);
        }
        if (this.hasUserAnswered(questionDoc) || !this.canAddAnswer) {
          for (const answer of this.getAnswers(questionDoc)) {
            if (!this.hasUserReadAnswer(answer)) {
              op.add(puc => puc.answerRefsRead, answer.dataId);
            }
            const comments = sortBy(answer.comments, c => c.dateCreated);
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

  checkCanChangeQuestion(newIndex: number): boolean {
    return !!this.questionDocs[this.activeQuestionIndex + newIndex];
  }

  hasUserAnswered(questionDoc: QuestionDoc): boolean {
    return CheckingUtils.hasUserAnswered(questionDoc.data, this.userService.currentUserId);
  }

  hasUserReadQuestion(questionDoc: QuestionDoc): boolean {
    return (
      this.projectUserConfigDoc != null &&
      CheckingUtils.hasUserReadQuestion(questionDoc.data, this.projectUserConfigDoc.data)
    );
  }

  hasUserReadAnswer(answer: Answer): boolean {
    return this.projectUserConfigDoc != null && this.projectUserConfigDoc.data != null
      ? this.projectUserConfigDoc.data.answerRefsRead.includes(answer.dataId) ||
          this.projectUserConfigDoc.data.ownerRef === answer.ownerRef
      : false;
  }

  hasUserReadComment(comment: Comment): boolean {
    return this.projectUserConfigDoc != null && this.projectUserConfigDoc.data != null
      ? this.projectUserConfigDoc.data.commentRefsRead.includes(comment.dataId) ||
          this.projectUserConfigDoc.data.ownerRef === comment.ownerRef
      : false;
  }

  nextQuestion(): void {
    this.changeQuestion(1);
  }

  previousQuestion(): void {
    this.changeQuestion(-1);
  }

  activateQuestion(questionDoc: QuestionDoc): void {
    // The reason for the convoluted questionChanged logic is because the change needs to be emitted even if it's the
    // same question, but calling activeQuestionDoc$.next when the question is unchanged causes complicated test errors
    this._activeQuestionVerseRef = questionDoc.data == null ? undefined : toVerseRef(questionDoc.data.verseRef);
    let questionChanged = true;
    if (this.activeQuestionDoc != null && this.activeQuestionDoc.id === questionDoc.id) {
      questionChanged = false;
    }
    this.activeQuestionDoc = questionDoc;
    if (questionDoc.data != null) {
      this.storeMostRecentQuestion(questionDoc.data.verseRef.bookNum).then(() => {
        this.changed.emit(questionDoc);
        if (questionChanged) {
          this.activeQuestionDoc$.next(questionDoc);
        }
      });
    }
  }

  private changeQuestion(newDifferential: number): void {
    if (this.activeQuestionDoc && this.checkCanChangeQuestion(newDifferential)) {
      this.activateQuestion(this.questionDocs[this.activeQuestionIndex + newDifferential]);
    }
  }

  private async storeMostRecentQuestion(bookNum: number): Promise<void> {
    if (this.projectUserConfigDoc != null && this.projectUserConfigDoc.data != null) {
      const activeQuestionDoc = this.activeQuestionDoc;
      if (activeQuestionDoc != null && activeQuestionDoc.data != null) {
        await this.projectService.trainSelectedSegment(this.projectUserConfigDoc.data);
        await this.projectUserConfigDoc.submitJson0Op(op => {
          op.set<string>(puc => puc.selectedTask!, 'checking');
          op.set(puc => puc.selectedQuestionRef!, activeQuestionDoc.id);
          this.isAllBooksShown ? op.unset(puc => puc.selectedBookNum!) : op.set(puc => puc.selectedBookNum!, bookNum);
          op.unset(puc => puc.selectedChapterNum!);
          op.unset(puc => puc.selectedSegment);
          op.unset(puc => puc.selectedSegmentChecksum!);
        });
      }
    }
  }
}
