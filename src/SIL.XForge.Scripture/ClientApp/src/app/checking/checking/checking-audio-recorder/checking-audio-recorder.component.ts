import { Component, EventEmitter, OnDestroy, OnInit, Output } from '@angular/core';
import RecordRTC from 'recordrtc';
import { UserDoc } from 'xforge-common/models/user-doc';
import { UserService } from 'xforge-common/user.service';

export interface AudioAttachment {
  status?: 'denied' | 'processed' | 'recording' | 'reset' | 'stopped' | 'uploaded';
  url?: string;
  fileName?: string;
  blob?: Blob;
}

@Component({
  selector: 'app-checking-audio-recorder',
  templateUrl: './checking-audio-recorder.component.html',
  styleUrls: ['./checking-audio-recorder.component.scss']
})
export class CheckingAudioRecorderComponent implements OnInit, OnDestroy {
  @Output() status: EventEmitter<AudioAttachment> = new EventEmitter<AudioAttachment>();
  audioUrl: string = '';
  microphonePermission: boolean;
  private stream: MediaStream;
  private recordRTC: RecordRTC;
  private user: UserDoc;

  constructor(private userService: UserService) {}

  get hasAudioAttachment(): boolean {
    return this.audioUrl !== '';
  }

  get isRecording(): boolean {
    return this.recordRTC && this.recordRTC.state === 'recording';
  }

  get recodingFileName(): string {
    return this.user.data.name + '.webm';
  }

  ngOnDestroy(): void {
    if (this.isRecording) {
      this.stopRecording();
    }
  }

  async ngOnInit() {
    this.user = await this.userService.getCurrentUser();
  }

  processAudio(audioVideoWebMURL: string) {
    this.audioUrl = audioVideoWebMURL;
    this.recordRTC.getDataURL(() => {});
    this.status.emit({
      url: audioVideoWebMURL,
      status: 'processed',
      blob: this.recordRTC.getBlob(),
      fileName: this.recodingFileName
    });
  }

  resetRecording(): void {
    this.audioUrl = '';
    this.status.emit({ status: 'reset' });
  }

  startRecording() {
    const mediaConstraints: MediaStreamConstraints = {
      audio: true
    };
    navigator.mediaDevices
      .getUserMedia(mediaConstraints)
      .then(this.successCallback.bind(this), this.errorCallback.bind(this));
    this.status.emit({ status: 'recording' });
  }

  async stopRecording() {
    this.recordRTC.stopRecording(this.processAudio.bind(this));
    this.stream.getAudioTracks().forEach(track => track.stop());
    this.status.emit({ status: 'stopped' });
    // Additional promise for when the audio has been processed and is available
    await new Promise(resolve => {
      const statusPromise = this.status.subscribe((status: AudioAttachment) => {
        if (status.status === 'processed') {
          resolve();
          statusPromise.unsubscribe();
        }
      });
    });
  }

  private errorCallback() {
    this.microphonePermission = false;
    this.status.emit({ status: 'denied' });
  }

  private successCallback(stream: MediaStream) {
    const options = {
      disableLogs: true,
      type: 'audio',
      mimeType: 'audio/webm'
    };
    this.stream = stream;
    this.recordRTC = RecordRTC(stream, options);
    this.recordRTC.startRecording();
  }
}
