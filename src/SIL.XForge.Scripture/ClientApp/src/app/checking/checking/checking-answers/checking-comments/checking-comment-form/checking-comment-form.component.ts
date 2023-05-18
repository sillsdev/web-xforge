import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { XFValidators } from 'xforge-common/xfvalidators';

@Component({
  selector: 'app-checking-comment-form',
  templateUrl: './checking-comment-form.component.html',
  styleUrls: ['./checking-comment-form.component.scss']
})
export class CheckingCommentFormComponent {
  @Input() set text(value: string | undefined) {
    if (value != null) {
      this.commentForm.controls.commentText.setValue(value);
    }
  }

  @Output() save: EventEmitter<string> = new EventEmitter<string>();
  @Output() cancel: EventEmitter<void> = new EventEmitter<void>();

  commentForm = new FormGroup({
    commentText: new FormControl('', [Validators.required, XFValidators.someNonWhitespace])
  });

  constructor() {}

  submit(): void {
    const commentText = this.commentForm.controls.commentText.value;
    if (this.commentForm.valid && typeof commentText === 'string') {
      this.save.emit(commentText);
      this.commentForm.reset();
    }
  }

  submitCancel(): void {
    this.commentForm.reset();
    this.cancel.emit();
  }

  get showValidationError(): boolean {
    const control = this.commentForm.controls.commentText;
    return control.invalid && control.touched;
  }
}
