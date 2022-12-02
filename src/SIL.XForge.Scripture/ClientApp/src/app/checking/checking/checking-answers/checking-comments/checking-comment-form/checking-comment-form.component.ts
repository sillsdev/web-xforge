import { Component, EventEmitter, Input, Output } from '@angular/core';
import { UntypedFormControl, UntypedFormGroup, Validators } from '@angular/forms';
import { XFValidators } from 'xforge-common/xfvalidators';

@Component({
  selector: 'app-checking-comment-form',
  templateUrl: './checking-comment-form.component.html',
  styleUrls: ['./checking-comment-form.component.scss']
})
export class CheckingCommentFormComponent {
  @Input() set text(value: string | undefined) {
    if (value != null) {
      this.commentText.setValue(value);
    }
  }

  @Output() save: EventEmitter<string> = new EventEmitter<string>();
  @Output() cancel: EventEmitter<boolean> = new EventEmitter<boolean>();

  commentForm: UntypedFormGroup = new UntypedFormGroup({
    commentText: new UntypedFormControl('', [Validators.required, XFValidators.someNonWhitespace])
  });
  constructor() {}

  submit(): void {
    if (this.commentForm.invalid) {
      return;
    }
    this.save.emit(this.commentText.value);
    this.commentForm.reset();
  }

  submitCancel(): void {
    this.commentForm.reset();
    this.cancel.emit(false);
  }

  private get commentText(): UntypedFormControl {
    return this.commentForm.controls.commentText as UntypedFormControl;
  }
}
