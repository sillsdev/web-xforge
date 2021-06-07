import { Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { InvalidFileItem } from 'angular-file/file-upload/fileTools';
import {
  AudioAttachment,
  CheckingAudioRecorderComponent
} from '../checking-audio-recorder/checking-audio-recorder.component';

const NOT_A_FILE = {} as File;

@Component({
  selector: 'app-checking-audio-combined',
  templateUrl: './checking-audio-combined.component.html',
  styleUrls: ['./checking-audio-combined.component.scss']
})
export class CheckingAudioCombinedComponent {
  @ViewChild(CheckingAudioRecorderComponent) audioRecorderComponent?: CheckingAudioRecorderComponent;
  @Input() source?: string = '';
  @Output() update = new EventEmitter<AudioAttachment>();

  uploadAudioFile: File = NOT_A_FILE;

  private audio: AudioAttachment = {};

  get isRecorderActive(): boolean {
    return (
      this.audio.status != null &&
      this.audio.status !== 'denied' &&
      this.audio.status !== 'reset' &&
      !this.isUploaderActive
    );
  }

  get isUploaderActive(): boolean {
    return (
      this.audio.status === 'uploaded' ||
      (this.source != null && this.source !== '' && this.audio.status !== 'processed')
    );
  }

  set lastInvalids(value: InvalidFileItem[]) {
    if (value == null) {
      return;
    }
    // Firefox does not recognize the valid .ogg file type because it reads it as a video, so handle it here
    if (value.length > 0 && value[0].file.type === 'video/ogg') {
      this.uploadAudioFile = value[0].file;
      this.prepareAudioFileUpload();
    }
  }

  prepareAudioFileUpload() {
    if (this.uploadAudioFile.name != null) {
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
        this.source = this.audio.url || '';
        break;
    }
    this.update.emit(this.audio);
  }

  resetAudioAttachment() {
    this.uploadAudioFile = NOT_A_FILE;
    this.source = '';
    this.audio = { status: 'reset' };
    this.update.emit(this.audio);
  }
}
