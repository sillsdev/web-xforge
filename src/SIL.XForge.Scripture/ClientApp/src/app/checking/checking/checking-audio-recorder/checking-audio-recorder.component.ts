import { Component, EventEmitter, Inject, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { translate } from '@ngneat/transloco';
import { NAVIGATOR } from 'xforge-common/browser-globals';
import { DialogService } from 'xforge-common/dialog.service';
import { NoticeService } from 'xforge-common/notice.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import {
  BrowserIssue,
  SupportedBrowsersDialogComponent
} from 'xforge-common/supported-browsers-dialog/supported-browsers-dialog.component';
import { audioRecordingMimeType, objectId } from 'xforge-common/utils';
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
  private mediaRecorder?: MediaRecorder;
  private recordedChunks: Blob[] = [];
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
    return this.mediaRecorder != null && this.mediaRecorder.state === 'recording';
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
    if (this.isRecording) {
      this.stopRecording();
    }
  }

  async ngOnInit(): Promise<void> {
    this.mediaDevicesUnsupported =
      this.navigator.mediaDevices?.getUserMedia == null || typeof MediaRecorder === 'undefined';
  }

  processAudio(): void {
    if (this.mediaRecorder == null) {
      return;
    }

    const blob = new Blob(this.recordedChunks, { type: audioRecordingMimeType() });
    this.audio = {
      url: URL.createObjectURL(blob),
      status: 'processed',
      blob: blob,
      fileName: objectId() + '.webm'
    };
    this._onTouched.emit();
  }

  resetRecording(): void {
    this.audio = { status: 'reset' };
    this.recordedChunks = [];
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
    if (this.mediaRecorder == null || this.stream == null) {
      return;
    }

    this.mediaRecorder.stop();
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

  private dataAvailableCallback(event: BlobEvent): void {
    if (event.data.size > 0) {
      this.recordedChunks.push(event.data);
    }
  }

  private successCallback(stream: MediaStream): void {
    const options: MediaRecorderOptions = {
      mimeType: audioRecordingMimeType()
    };
    this.stream = stream;
    this.recordedChunks = [];
    this.mediaRecorder = new MediaRecorder(stream, options);
    this.mediaRecorder.ondataavailable = event => this.dataAvailableCallback(event);
    this.mediaRecorder.onstop = () => this.processAudio();
    this.mediaRecorder.start();
    this.audio = { status: 'recording' };
  }
}
