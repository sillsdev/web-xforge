import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import cloneDeep from 'lodash/cloneDeep';
import { Answer } from 'realtime-server/lib/scriptureforge/models/answer';
import { Comment } from 'realtime-server/lib/scriptureforge/models/comment';
import { SFProject } from 'realtime-server/lib/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/scriptureforge/models/sf-project-role';
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
export class CheckingCommentsComponent implements OnInit {
  @Input() project: SFProject;
  @Input() projectUserConfigDoc: SFProjectUserConfigDoc;
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
    return this.project.userRoles[this.projectUserConfigDoc.data.ownerRef] === SFProjectRole.ParatextAdministrator;
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
    this.activeComment = cloneDeep(comment);
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
    return (
      this.initUserCommentRefsRead.includes(comment.id) || this.projectUserConfigDoc.data.ownerRef === comment.ownerRef
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
