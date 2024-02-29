import { Component, EventEmitter, Inject, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { translate } from '@ngneat/transloco';
import RecordRTC from 'recordrtc';
import { NAVIGATOR } from 'xforge-common/browser-globals';
import { DialogService } from 'xforge-common/dialog.service';
import { DialogService } from 'xforge-common/dialog.service';
import { NoticeService } from 'xforge-common/notice.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import {
  BrowserIssue,
  SupportedBrowsersDialogComponent
} from 'xforge-common/supported-browsers-dialog/supported-browsers-dialog.component';
import { objectId } from 'xforge-common/utils';
import { SingleButtonAudioPlayerComponent } from '../single-button-audio-player/single-button-audio-player.component';

export interface AudioAttachment {
  status?: 'denied' | 'processed' | 'recording' | 'reset' | 'stopped' | 'uploaded';
  url?: string;
  fileName?: string;
  blob?: Blob;
}

@Component({
  selector: 'app-checking-audio-recorder',
  templateUrl: './checking-audio-recorder.component.html',
  styleUrls: ['./checking-audio-recorder.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: CheckingAudioRecorderComponent
    }
  ]
})
/* eslint-disable brace-style */
export class CheckingAudioRecorderComponent
  extends SubscriptionDisposable
  implements ControlValueAccessor, OnInit, OnDestroy
{
  @ViewChild(SingleButtonAudioPlayerComponent) audioPlayer?: SingleButtonAudioPlayerComponent;
  @Output() status = new EventEmitter<AudioAttachment>();

  get audio(): AudioAttachment {
    return this._audio;
  }
  @Input() set audio(audio: AudioAttachment) {
    this._audio = audio;
    this.status.emit(audio);
  }

  mediaDevicesUnsupported: boolean = false;
  private stream?: MediaStream;
  private recordRTC?: RecordRTC;
  private _audio: AudioAttachment = {};
  private _onTouched = new EventEmitter();

  constructor(
    private readonly noticeService: NoticeService,
    @Inject(NAVIGATOR) private readonly navigator: Navigator,
    private readonly dialogService: DialogService
  ) {
    super();
  }

  writeValue(obj: AudioAttachment): void {
    this.audio = obj;
  }

  registerOnChange(fn: ((value: AudioAttachment) => void) | undefined): void {
    this.subscribe(this.status, fn);
  }

  registerOnTouched(fn: ((value: AudioAttachment) => void) | undefined): void {
    this.subscribe(this._onTouched, fn);
  }

  get hasAudioAttachment(): boolean {
    return this.audio.url !== undefined;
  }

  get isRecording(): boolean {
    return this.recordRTC != null && this.recordRTC.state === 'recording';
  }

  ngOnDestroy(): void {
    if (this.isRecording) {
      this.stopRecording();
    }
  }

  async ngOnInit(): Promise<void> {
    this.mediaDevicesUnsupported = this.navigator.mediaDevices?.getUserMedia == null;
  }

  processAudio(audioVideoWebMURL: string): void {
    if (this.recordRTC == null) {
      return;
    }

    this.recordRTC.getDataURL(() => {});
    this.audio = {
      url: audioVideoWebMURL,
      status: 'processed',
      blob: this.recordRTC.getBlob(),
      fileName: objectId() + '.webm'
    };
    this._onTouched.emit();
  }

  resetRecording(): void {
    this.audio = { status: 'reset' };
    this._onTouched.emit();
  }

  startRecording(): void {
    const mediaConstraints: MediaStreamConstraints = { audio: true };
    if (this.mediaDevicesUnsupported) {
      this.audio = { status: 'denied' };
      this.dialogService.openMatDialog(SupportedBrowsersDialogComponent, { data: BrowserIssue.AudioRecording });
      return;
    }
    this.navigator.mediaDevices
      .getUserMedia(mediaConstraints)
      .then(this.successCallback.bind(this), this.errorCallback.bind(this));
  }

  async stopRecording(): Promise<void> {
    if (this.recordRTC == null || this.stream == null) {
      return;
    }

    this.recordRTC.stopRecording(this.processAudio.bind(this));
    this.stream.getAudioTracks().forEach(track => track.stop());
    this.audio = { status: 'stopped' };
    // Additional promise for when the audio has been processed and is available
    await new Promise<void>(resolve => {
      const statusPromise = this.status.subscribe((status: AudioAttachment) => {
        if (status.status === 'processed') {
          resolve();
          statusPromise.unsubscribe();
        }
      });
    });
  }

  toggleAudio(): void {
    this.audioPlayer?.playing ? this.audioPlayer?.stop() : this.audioPlayer?.play();
    this._onTouched.emit();
  }

  private errorCallback(error: any): void {
    console.error(error);
    this.audio = { status: 'denied' };

    if (error.code === DOMException.NOT_FOUND_ERR) {
      this.noticeService.show(translate('checking_audio_recorder.mic_not_found'));
    } else {
      this.noticeService.show(translate('checking_audio_recorder.mic_access_denied'));
    }
  }

  private successCallback(stream: MediaStream): void {
    const options = {
      disableLogs: true,
      type: 'audio',
      mimeType: 'audio/webm',
      recorderType: RecordRTC.StereoAudioRecorder
    };
    this.stream = stream;
    this.recordRTC = RecordRTC(stream, options);
    this.recordRTC.startRecording();
    this.audio = { status: 'recording' };
  }
}
