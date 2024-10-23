import { Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { translate } from '@ngneat/transloco';
import { Comment } from 'realtime-server/lib/esm/scriptureforge/models/comment';
import { NoticeService } from 'xforge-common/notice.service';
import { TextAndAudioComponent } from '../../../../text-and-audio/text-and-audio.component';
import { AudioAttachment } from '../../../checking-audio-recorder/checking-audio-recorder.component';

@Component({
  selector: 'app-checking-comment-form',
  templateUrl: './checking-comment-form.component.html',
  styleUrls: ['./checking-comment-form.component.scss']
})
export class CheckingCommentFormComponent {
  @Input() comment?: Comment;
  @Output() save: EventEmitter<{ text?: string; audio?: AudioAttachment }> = new EventEmitter<{
    text?: string;
    audio?: AudioAttachment;
  }>();
  @Output() cancel: EventEmitter<void> = new EventEmitter<void>();
  @ViewChild(TextAndAudioComponent) textAndAudio?: TextAndAudioComponent;

  constructor(private readonly noticeService: NoticeService) {}

  async submit(): Promise<void> {
    if (this.textAndAudio != null) {
      this.textAndAudio.suppressErrors = false;
      if (this.textAndAudio.audioComponent?.isRecording) {
        await this.textAndAudio.audioComponent.stopRecording();
        this.noticeService.show(translate('checking_answers.recording_automatically_stopped'));
      }
    }
    if (!this.textAndAudio?.hasTextOrAudio()) {
      this.textAndAudio?.text.setErrors({ invalid: true });
      return;
    }
    const comment = { text: this.textAndAudio?.text.value, audio: this.textAndAudio?.audioAttachment };
    this.save.emit(comment);
  }

  submitCancel(): void {
    this.cancel.emit();
  }
}
