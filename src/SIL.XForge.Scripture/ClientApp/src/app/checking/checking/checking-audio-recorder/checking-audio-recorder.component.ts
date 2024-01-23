import { Component, EventEmitter, Inject, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { translate } from '@ngneat/transloco';
import RecordRTC from 'recordrtc';
import { NAVIGATOR } from 'xforge-common/browser-globals';
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
// eslint-disable-next-line brace-style
export class CheckingAudioRecorderComponent
  extends SubscriptionDisposable
  implements ControlValueAccessor, OnInit, OnDestroy
{
  @ViewChild(SingleButtonAudioPlayerComponent) audioPlayer?: SingleButtonAudioPlayerComponent;
  @Output() status = new EventEmitter<AudioAttachment>();
  @Input() audioUrl: string = '';
  @Input() compact: boolean = false;
  mediaDevicesUnsupported: boolean = false;
  private stream?: MediaStream;
  private recordRTC?: RecordRTC;
  private _onTouched = new EventEmitter();

  constructor(
    private readonly noticeService: NoticeService,
    @Inject(NAVIGATOR) private readonly navigator: Navigator,
    private readonly dialogService: DialogService
  ) {
    super();
  }

  writeValue(obj: any): void {
    this.audioUrl = obj;
  }

  registerOnChange(fn: any): void {
    this.subscribe(this.status, fn);
  }

  registerOnTouched(fn: any): void {
    this.subscribe(this._onTouched, fn);
  }

  get hasAudioAttachment(): boolean {
    return this.audioUrl?.length > 0;
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

    this.audioUrl = audioVideoWebMURL;
    this.recordRTC.getDataURL(() => {});
    this.status.emit({
      url: audioVideoWebMURL,
      status: 'processed',
      blob: this.recordRTC.getBlob(),
      fileName: objectId() + '.webm'
    });
    this._onTouched.emit();
  }

  resetRecording(): void {
    this.audioUrl = '';
    this.status.emit({ status: 'reset' });
    this._onTouched.emit();
  }

  startRecording(): void {
    const mediaConstraints: MediaStreamConstraints = { audio: true };
    if (this.mediaDevicesUnsupported) {
      this.status.emit({ status: 'denied' });
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
    this.status.emit({ status: 'stopped' });
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
    this.status.emit({ status: 'denied' });

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
    this.status.emit({ status: 'recording' });
  }
}
