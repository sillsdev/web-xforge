import { Component, EventEmitter, Input, Output } from '@angular/core';
import sortBy from 'lodash/sortBy';
import { Answer } from 'realtime-server/lib/scriptureforge/models/answer';
import { Comment } from 'realtime-server/lib/scriptureforge/models/comment';
import { SFProject } from 'realtime-server/lib/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/scriptureforge/models/sf-project-role';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { UserService } from 'xforge-common/user.service';
import { QuestionDoc } from '../../../core/models/question-doc';
import { SFProjectUserConfigDoc } from '../../../core/models/sf-project-user-config-doc';
import { CheckingUtils } from '../../checking.utils';

@Component({
  selector: 'app-checking-questions',
  templateUrl: './checking-questions.component.html',
  styleUrls: ['./checking-questions.component.scss']
})
export class CheckingQuestionsComponent extends SubscriptionDisposable {
  @Input() project: SFProject;
  @Input() projectUserConfigDoc: SFProjectUserConfigDoc;
  @Output() update = new EventEmitter<QuestionDoc>();
  @Output() changed = new EventEmitter<QuestionDoc>();
  _questionDocs: Readonly<QuestionDoc[]> = [];
  activeQuestionDoc: QuestionDoc;
  activeQuestionDoc$ = new Subject<QuestionDoc>();

  constructor(private userService: UserService) {
    super();
    // Only mark as read if it has been viewed for a set period of time and not an accidental click
    this.subscribe(this.activeQuestionDoc$.pipe(debounceTime(2000)), questionDoc => {
      this.updateElementsRead(questionDoc);
    });
  }

  get activeQuestionChapter(): number {
    return this.activeQuestionDoc.data.verseRef.chapterNum;
  }

  get activeQuestionIndex(): number {
    return this.questionDocs.findIndex(question => question.id === this.activeQuestionDoc.id);
  }

  get isAdministrator(): boolean {
    if (this.project == null || this.projectUserConfigDoc == null || !this.projectUserConfigDoc.isLoaded) {
      return false;
    }
    return this.project.userRoles[this.projectUserConfigDoc.data.ownerRef] === SFProjectRole.ParatextAdministrator;
  }

  get questionDocs(): Readonly<QuestionDoc[]> {
    return this._questionDocs;
  }

  @Input() set questionDocs(questionDocs: Readonly<QuestionDoc[]>) {
    if (questionDocs.length) {
      if (this.activeQuestionDoc == null || !questionDocs.some(question => question.id === this.activeQuestionDoc.id)) {
        this.activateQuestion(questionDocs[0]);
      }
    } else {
      this.activeQuestionDoc = undefined;
    }
    this._questionDocs = questionDocs;
  }

  getAnswers(questionDoc: QuestionDoc): Answer[] {
    if (this.project.checkingConfig.usersSeeEachOthersResponses || this.isAdministrator) {
      return questionDoc.data.answers;
    } else {
      return questionDoc.data.answers.filter(answer => answer.ownerRef === this.userService.currentUserId);
    }
  }

  getUnreadAnswers(questionDoc: QuestionDoc): number {
    let unread = 0;
    if (!this.isAdministrator && !this.project.checkingConfig.usersSeeEachOthersResponses) {
      return unread;
    }
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

  updateElementsRead(questionDoc: QuestionDoc): void {
    this.projectUserConfigDoc
      .submitJson0Op(op => {
        if (!this.hasUserReadQuestion(questionDoc)) {
          op.add(puc => puc.questionRefsRead, questionDoc.data.dataId);
        }
        if (this.hasUserAnswered(questionDoc) || this.isAdministrator) {
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
    return CheckingUtils.hasUserReadQuestion(questionDoc.data, this.projectUserConfigDoc.data);
  }

  hasUserReadAnswer(answer: Answer): boolean {
    return this.projectUserConfigDoc.data.answerRefsRead
      ? this.projectUserConfigDoc.data.answerRefsRead.includes(answer.dataId) ||
          this.projectUserConfigDoc.data.ownerRef === answer.ownerRef
      : false;
  }

  hasUserReadComment(comment: Comment): boolean {
    return this.projectUserConfigDoc.data.commentRefsRead
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
    this.activeQuestionDoc = questionDoc;
    this.changed.emit(questionDoc);
    this.activeQuestionDoc$.next(questionDoc);
  }

  private changeQuestion(newDifferential: number): void {
    if (this.activeQuestionDoc && this.checkCanChangeQuestion(newDifferential)) {
      this.activateQuestion(this.questionDocs[this.activeQuestionIndex + newDifferential]);
    }
  }
}
