import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { clone } from '@orbit/utils';
import { UserService } from 'xforge-common/user.service';
import { Answer } from '../../../../core/models/answer';
import { Comment } from '../../../../core/models/comment';
import { SFProjectRoles } from '../../../../core/models/sfproject-roles';
import { SFProjectUser } from '../../../../core/models/sfproject-user';

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
export class CheckingCommentsComponent implements OnInit {
  @Input() projectCurrentUser: SFProjectUser;
  @Output() action: EventEmitter<CommentAction> = new EventEmitter<CommentAction>();
  @Input() comments: Comment[] = [];
  @Input() answer: Answer;

  activeComment: Comment;
  commentFormVisible: boolean = false;
  maxCommentsToShow: number = 3;
  showAllComments: boolean = false;
  private initUserCommentRefsRead: string[] = [];

  constructor(private userService: UserService) {}

  get isAdministrator(): boolean {
    return this.projectCurrentUser.role === SFProjectRoles.ParatextAdministrator;
  }

  get showMoreCommentsLabel(): string {
    let label = 'Show ' + (this.comments.length - (this.maxCommentsToShow - 1)) + ' more comments';
    let counter = 1;
    let unread = 0;
    for (const comment of this.comments) {
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

  editComment(comment: Comment) {
    this.activeComment = clone(comment);
    this.showCommentForm();
  }

  deleteComment(comment: Comment) {
    this.action.emit({
      action: 'delete',
      comment: comment
    });
  }

  hasPermission(comment: Comment, permission: string): boolean {
    if (this.userService.currentUserId === comment.ownerRef) {
      return true;
    } else if (permission === 'delete' && this.isAdministrator) {
      return true;
    }
    return false;
  }

  hasUserReadComment(comment: Comment): boolean {
    return this.initUserCommentRefsRead.includes(comment.id) || this.projectCurrentUser.userRef === comment.ownerRef;
  }

  hideCommentForm() {
    this.commentFormVisible = false;
    this.activeComment = undefined;
    this.action.emit({
      action: 'hide-form'
    });
  }

  ngOnInit(): void {
    this.initUserCommentRefsRead = clone(this.projectCurrentUser.commentRefsRead);
  }

  showComments(): void {
    this.showAllComments = true;
    this.action.emit({
      action: 'show-comments'
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
