import { Component, EventEmitter, Inject, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { translate, TranslocoModule } from '@ngneat/transloco';
import { NAVIGATOR } from 'xforge-common/browser-globals';
import { DialogService } from 'xforge-common/dialog.service';
import { NoticeService } from 'xforge-common/notice.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import {
  BrowserIssue,
  SupportedBrowsersDialogComponent
} from 'xforge-common/supported-browsers-dialog/supported-browsers-dialog.component';
import { isGecko, objectId } from 'xforge-common/utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { timer } from 'rxjs';
import { map, take } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { SingleButtonAudioPlayerComponent } from '../../checking/checking/single-button-audio-player/single-button-audio-player.component';
import { SharedModule } from '../shared.module';

export interface AudioAttachment {
  status?: 'denied' | 'processed' | 'recording' | 'reset' | 'stopped' | 'uploaded';
  url?: string;
  fileName?: string;
  blob?: Blob;
}

export interface AudioRecorderDialogData {
  countdown?: boolean;
  audio?: AudioAttachment;
}

@Component({
  standalone: true,
  selector: 'app-audio-recorder-dialog',
  templateUrl: './audio-recorder-dialog.component.html',
  styleUrl: './audio-recorder-dialog.component.scss',
  imports: [UICommonModule, CommonModule, SharedModule, TranslocoModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: AudioRecorderDialogComponent
    }
  ]
})
/* eslint-disable brace-style */
export class AudioRecorderDialogComponent
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

  showCountdown: boolean;
  countdownTimer: number = 0;
  mediaDevicesUnsupported: boolean = false;
  private stream?: MediaStream;
  private mediaRecorder?: MediaRecorder;
  private recordedChunks: Blob[] = [];
  private _audio: AudioAttachment = {};
  private _onTouched = new EventEmitter();

  constructor(
    public readonly dialogRef: MatDialogRef<AudioRecorderDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: AudioRecorderDialogData,
    private readonly noticeService: NoticeService,
    @Inject(NAVIGATOR) private readonly navigator: Navigator,
    private readonly dialogService: DialogService
  ) {
    super();
    this.showCountdown = data?.countdown ?? false;
    if (data?.audio != null) {
      this.audio = data.audio;
    }
    if (this.showCountdown) {
      this.startCountdown();
    }
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

    const blob = new Blob(this.recordedChunks, { type: this.mimeType });
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

  saveRecording(): void {
    if (this.audio.status !== 'processed') {
      return;
    }
    this.dialogRef.close(this.audio);
  }

  startCountdown(): void {
    // Start a countdown timer from 3 seconds to zero and then start recording
    const seconds = 3;
    const countdown$ = timer(0, 1000).pipe(
      take(seconds + 1),
      map(countown => seconds - countown)
    );

    countdown$.subscribe({
      next: value => {
        this.countdownTimer = value;
      },
      complete: () => {
        this.showCountdown = false;
        this.startRecording();
      }
    });
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

  private get mimeType(): string {
    // If OGG is not used on Firefox, recording does not work correctly.
    // See https://github.com/muaz-khan/RecordRTC/issues/166#issuecomment-242942400
    return isGecko() ? 'audio/ogg' : 'audio/webm';
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
      mimeType: this.mimeType
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
