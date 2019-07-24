import { Component, EventEmitter, Input, Output } from '@angular/core';
import { AudioAttachment } from '../checking-audio-recorder/checking-audio-recorder.component';

@Component({
  selector: 'app-checking-audio-combined',
  templateUrl: './checking-audio-combined.component.html',
  styleUrls: ['./checking-audio-combined.component.scss']
})
export class CheckingAudioCombinedComponent {
  @Input() source: string = '';
  @Output() update: EventEmitter<AudioAttachment> = new EventEmitter<AudioAttachment>();

  uploadAudioFile: File;

  private audio: AudioAttachment = {};

  get isRecorderActive(): boolean {
    return (
      this.audio.status && this.audio.status !== 'denied' && this.audio.status !== 'reset' && !this.isUploaderActive
    );
  }

  get isUploaderActive(): boolean {
    return this.audio.status === 'uploaded' || (this.source && this.source !== '');
  }

  prepareAudioFileUpload() {
    if (this.uploadAudioFile) {
      this.audio.url = URL.createObjectURL(this.uploadAudioFile);
      this.audio.blob = this.uploadAudioFile;
      this.audio.fileName = this.uploadAudioFile.name;
      this.audio.status = 'uploaded';
      this.source = this.audio.url;
      this.update.emit(this.audio);
    }
  }

  recorderStatus(status: AudioAttachment): void {
    this.audio.status = status.status;
    switch (status.status) {
      case 'reset':
        this.audio = { status: 'reset' };
        break;
      case 'processed':
        this.audio.url = status.url;
        this.audio.blob = status.blob;
        this.audio.fileName = status.fileName;
        break;
    }
    this.update.emit(this.audio);
  }

  resetAudioFileUpload() {
    this.uploadAudioFile = null;
    this.source = '';
    this.audio = { status: 'reset' };
    this.update.emit(this.audio);
  }
}
