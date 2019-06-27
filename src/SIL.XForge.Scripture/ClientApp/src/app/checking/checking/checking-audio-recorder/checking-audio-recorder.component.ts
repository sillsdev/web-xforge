import { Component } from '@angular/core';
import RecordRTC from 'recordrtc';

@Component({
  selector: 'app-checking-audio-recorder',
  templateUrl: './checking-audio-recorder.component.html',
  styleUrls: ['./checking-audio-recorder.component.scss']
})
export class CheckingAudioRecorderComponent {
  audioUrl: string = '';
  private stream: MediaStream;
  private recordRTC: RecordRTC;

  get hasAudioAttachment(): boolean {
    return this.audioUrl !== '';
  }

  get isRecording(): boolean {
    return this.recordRTC && this.recordRTC.state === 'recording';
  }

  errorCallback() {
    // handle error here
  }

  processAudio(audioVideoWebMURL: string) {
    this.audioUrl = audioVideoWebMURL;
    this.recordRTC.getDataURL(() => {});
  }

  resetRecording(): void {
    this.audioUrl = '';
  }

  startRecording() {
    const mediaConstraints: MediaStreamConstraints = {
      audio: true
    };
    navigator.mediaDevices
      .getUserMedia(mediaConstraints)
      .then(this.successCallback.bind(this), this.errorCallback.bind(this));
  }

  stopRecording() {
    this.recordRTC.stopRecording(this.processAudio.bind(this));
    this.stream.getAudioTracks().forEach(track => track.stop());
  }

  successCallback(stream: MediaStream) {
    const options = {
      type: 'audio/webm'
    };
    this.stream = stream;
    this.recordRTC = RecordRTC(stream, options);
    this.recordRTC.startRecording();
  }
}
