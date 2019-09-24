import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import cloneDeep from 'lodash/cloneDeep';
import sortBy from 'lodash/sortBy';
import { Operation } from 'realtime-server/lib/common/models/project-rights';
import { Answer } from 'realtime-server/lib/scriptureforge/models/answer';
import { Comment } from 'realtime-server/lib/scriptureforge/models/comment';
import { SFProject } from 'realtime-server/lib/scriptureforge/models/sf-project';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from 'realtime-server/lib/scriptureforge/models/sf-project-rights';
import { SFProjectRole } from 'realtime-server/lib/scriptureforge/models/sf-project-role';
import { QuestionDoc } from 'src/app/core/models/question-doc';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { UserService } from 'xforge-common/user.service';
import { SFProjectUserConfigDoc } from '../../../../core/models/sf-project-user-config-doc';

export interface CommentAction {
  action: 'delete' | 'save' | 'show-form' | 'hide-form' | 'show-comments';
  comment?: Comment;
  answer?: Answer;
  text?: string;
}

@Component({
  selector: 'app-checking-comments',
  templateUrl: './checking-comments.component.html',
  styleUrls: ['./checking-comments.component.scss']
})
export class CheckingCommentsComponent extends SubscriptionDisposable implements OnInit {
  @Input() project: SFProject;
  @Input() projectUserConfigDoc: SFProjectUserConfigDoc;
  @Input() questionDoc: QuestionDoc;
  @Output() action: EventEmitter<CommentAction> = new EventEmitter<CommentAction>();
  @Input() answer: Answer;

  activeComment: Comment;
  commentFormVisible: boolean = false;
  readonly maxCommentsToShow: number = 3;
  showAllComments: boolean = false;
  private initUserCommentRefsRead: string[] = [];

  constructor(private userService: UserService) {
    super();
  }

  get showMoreCommentsLabel(): string {
    const comments = this.getSortedComments();
    let label = 'Show ' + (comments.length - (this.maxCommentsToShow - 1)) + ' more comments';
    let counter = 1;
    let unread = 0;
    for (const comment of comments) {
      if (counter >= this.maxCommentsToShow) {
        if (!this.hasUserReadComment(comment)) {
          unread++;
        }
      }
      counter++;
    }
    label += unread ? ' - ' + unread + ' unread' : '';
    return label;
  }

  get commentCount(): number {
    return this.answer != null ? this.answer.comments.length : 0;
  }

  get canAddComment(): boolean {
    return SF_PROJECT_RIGHTS.hasRight(this.projectRole, {
      projectDomain: SFProjectDomain.AnswerComments,
      operation: Operation.Create
    });
  }

  private get projectRole(): SFProjectRole {
    if (this.project == null || this.projectUserConfigDoc == null || !this.projectUserConfigDoc.isLoaded) {
      return SFProjectRole.None;
    }
    return this.project.userRoles[this.projectUserConfigDoc.data.ownerRef] as SFProjectRole;
  }

  getSortedComments(): Comment[] {
    return this.answer != null ? sortBy(this.answer.comments, c => c.dateCreated) : [];
  }

  editComment(comment: Comment) {
    this.activeComment = cloneDeep(comment);
    this.showCommentForm();
  }

  deleteComment(comment: Comment) {
    this.action.emit({
      action: 'delete',
      answer: this.answer,
      comment: comment
    });
  }

  canEditComment(comment: Comment): boolean {
    return SF_PROJECT_RIGHTS.hasRight(
      this.projectRole,
      { projectDomain: SFProjectDomain.AnswerComments, operation: Operation.Edit },
      this.userService.currentUserId,
      comment
    );
  }

  canDeleteComment(comment: Comment): boolean {
    return SF_PROJECT_RIGHTS.hasRight(
      this.projectRole,
      { projectDomain: SFProjectDomain.AnswerComments, operation: Operation.Delete },
      this.userService.currentUserId,
      comment
    );
  }

  hasUserReadComment(comment: Comment): boolean {
    return (
      this.initUserCommentRefsRead.includes(comment.dataId) ||
      this.projectUserConfigDoc.data.ownerRef === comment.ownerRef
    );
  }

  hideCommentForm() {
    this.commentFormVisible = false;
    this.activeComment = undefined;
    this.action.emit({
      action: 'hide-form'
    });
  }

  ngOnInit(): void {
    this.initUserCommentRefsRead = cloneDeep(this.projectUserConfigDoc.data.commentRefsRead);
    this.subscribe(this.questionDoc.remoteChanges$, () => {
      const defaultCommentsToShow =
        this.answer.comments.length > this.maxCommentsToShow ? this.maxCommentsToShow - 1 : this.answer.comments.length;
      const commentsToShow = this.showAllComments ? this.answer.comments.length : defaultCommentsToShow;
      const commentIdsToMarkRead: string[] = [];
      let commentNumber = 1;
      // Older comments are displayed above newer comments, so iterate over comments starting with the oldest
      for (const comment of this.getSortedComments()) {
        if (!this.projectUserConfigDoc.data.commentRefsRead.includes(comment.dataId)) {
          commentIdsToMarkRead.push(comment.dataId);
        }
        commentNumber++;
        if (commentNumber > commentsToShow) {
          break;
        }
      }
      if (commentIdsToMarkRead.length) {
        this.projectUserConfigDoc.submitJson0Op(op => {
          for (const commentId of commentIdsToMarkRead) {
            op.add(puc => puc.commentRefsRead, commentId);
          }
        });
      }
    });
  }

  showComments(): void {
    this.showAllComments = true;
    this.action.emit({
      action: 'show-comments',
      answer: this.answer
    });
  }

  showCommentForm() {
    this.commentFormVisible = true;
    this.action.emit({
      action: 'show-form'
    });
  }

  submit(text: string): void {
    this.action.emit({
      action: 'save',
      answer: this.answer,
      text: text,
      comment: this.activeComment
    });
    this.hideCommentForm();
    this.showAllComments = true;
  }
}
