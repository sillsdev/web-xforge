import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { XFValidators } from 'xforge-common/xfvalidators';

@Component({
  selector: 'app-checking-comment-form',
  templateUrl: './checking-comment-form.component.html',
  styleUrls: ['./checking-comment-form.component.scss']
})
export class CheckingCommentFormComponent {
  @Input() text: string = '';
  @Output() save: EventEmitter<String> = new EventEmitter<String>();
  @Output() cancel: EventEmitter<Boolean> = new EventEmitter<Boolean>();

  commentForm: FormGroup = new FormGroup({
    commentText: new FormControl('', [Validators.required, XFValidators.someNonWhitespace])
  });
  constructor() {}

  submit(): void {
    if (this.commentForm.invalid) {
      return;
    }
    this.save.emit(this.commentForm.get('commentText').value);
    this.commentForm.reset();
  }

  submitCancel(): void {
    this.commentForm.reset();
    this.cancel.emit(false);
  }
}
