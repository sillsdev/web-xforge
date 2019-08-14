import { Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import {
  AudioAttachment,
  CheckingAudioRecorderComponent
} from '../checking-audio-recorder/checking-audio-recorder.component';

@Component({
  selector: 'app-checking-audio-combined',
  templateUrl: './checking-audio-combined.component.html',
  styleUrls: ['./checking-audio-combined.component.scss']
})
export class CheckingAudioCombinedComponent {
  @ViewChild(CheckingAudioRecorderComponent) audioRecorderComponent: CheckingAudioRecorderComponent;
  @Input() source: string = '';
  @Output() update: EventEmitter<AudioAttachment> = new EventEmitter<AudioAttachment>();
  @Output() playRequested: EventEmitter<HTMLAudioElement> = new EventEmitter<HTMLAudioElement>();

  uploadAudioFile: File;

  private audio: AudioAttachment = {};

  get isRecorderActive(): boolean {
    return (
      this.audio.status && this.audio.status !== 'denied' && this.audio.status !== 'reset' && !this.isUploaderActive
    );
  }

  get isUploaderActive(): boolean {
    return this.audio.status === 'uploaded' || (this.source && this.source !== '' && this.audio.status !== 'processed');
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
        this.resetAudioAttachment();
        break;
      case 'processed':
        this.audio.url = status.url;
        this.audio.blob = status.blob;
        this.audio.fileName = status.fileName;
        this.source = this.audio.url;
        break;
    }
    this.update.emit(this.audio);
  }

  resetAudioAttachment() {
    this.uploadAudioFile = null;
    this.source = '';
    this.audio = { status: 'reset' };
    this.update.emit(this.audio);
  }
}
