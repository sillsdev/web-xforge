import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { UserService } from 'xforge-common/user.service';
import { Answer } from '../../../../core/models/answer';
import { Comment } from '../../../../core/models/comment';

export interface CommentAction {
  action: 'delete' | 'save' | 'show-form' | 'hide-form';
  comment?: Comment;
  answer?: Answer;
  text?: string;
}

@Component({
  selector: 'app-checking-comments',
  templateUrl: './checking-comments.component.html',
  styleUrls: ['./checking-comments.component.scss']
})
export class CheckingCommentsComponent {
  @Output() action: EventEmitter<CommentAction> = new EventEmitter<CommentAction>();
  @Input() comments: Comment[] = [];
  @Input() answer: Answer;

  activeComment: Comment;
  commentFormVisible: boolean = false;
  maxCommentsToShow: number = 3;
  showAllComments: boolean = false;

  constructor(private userService: UserService) {}

  editComment(comment: Comment) {
    this.activeComment = comment;
    this.showCommentForm();
  }

  deleteComment(comment: Comment) {
    this.action.emit({
      action: 'delete',
      comment: comment
    });
  }

  hasPermission(comment: Comment, permission: string): boolean {
    // TODO: (NW) Improve permission checking in later Jira task
    return this.userService.currentUserId === comment.ownerRef;
  }

  hideCommentForm() {
    this.commentFormVisible = false;
    this.activeComment = undefined;
    this.action.emit({
      action: 'hide-form'
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
