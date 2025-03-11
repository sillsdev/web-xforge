import { CommonModule } from '@angular/common';
import {
  Component,
  DestroyRef,
  EventEmitter,
  Inject,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild
} from '@angular/core';
import { ControlValueAccessor } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { translate, TranslocoModule } from '@ngneat/transloco';
import { interval, Observable, Subscription, timer } from 'rxjs';
import { map, take } from 'rxjs/operators';
import { NAVIGATOR } from 'xforge-common/browser-globals';
import { DialogService } from 'xforge-common/dialog.service';
import { NoticeService } from 'xforge-common/notice.service';
import {
  BrowserIssue,
  SupportedBrowsersDialogComponent
} from 'xforge-common/supported-browsers-dialog/supported-browsers-dialog.component';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { audioRecordingMimeType, objectId, quietTakeUntilDestroyed } from 'xforge-common/utils';
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

export interface AudioRecorderDialogResult {
  audio: AudioAttachment;
}

@Component({
  standalone: true,
  selector: 'app-audio-recorder-dialog',
  templateUrl: './audio-recorder-dialog.component.html',
  styleUrl: './audio-recorder-dialog.component.scss',
  imports: [UICommonModule, CommonModule, SharedModule, TranslocoModule]
})
/* eslint-disable brace-style */
export class AudioRecorderDialogComponent implements ControlValueAccessor, OnInit, OnDestroy {
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

  private destroyed = false;
  private stream?: MediaStream;
  private mediaRecorder?: MediaRecorder;
  private recordedChunks: Blob[] = [];
  private _audio: AudioAttachment = {};
  private _onTouched = new EventEmitter();
  private refreshWaveformSub?: Subscription;
  private canvasContext: CanvasRenderingContext2D | null = null;
  // height and width are calculated when the canvas is initialized
  private visualizerHeight = 150;
  private visualizerWidth = 300;
  private audioWaveformBase = 128;

  constructor(
    public readonly dialogRef: MatDialogRef<AudioRecorderDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: AudioRecorderDialogData,
    private readonly noticeService: NoticeService,
    @Inject(NAVIGATOR) private readonly navigator: Navigator,
    private readonly dialogService: DialogService,
    private readonly destroyRef: DestroyRef
  ) {
    this.showCountdown = data?.countdown ?? false;
    if (data?.audio != null) {
      this.audio = data.audio;
    }
    if (this.showCountdown) {
      this.navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then(this.startCountdown.bind(this), this.errorCallback.bind(this));
    }
  }

  get hasAudioAttachment(): boolean {
    return !!this.audio.url;
  }

  get isRecording(): boolean {
    return this.mediaRecorder != null && this.mediaRecorder.state === 'recording';
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.isRecording) {
      this.stopRecording();
    }
  }

  async ngOnInit(): Promise<void> {
    this.mediaDevicesUnsupported =
      this.navigator.mediaDevices?.getUserMedia == null || typeof MediaRecorder === 'undefined';
  }

  writeValue(obj: AudioAttachment): void {
    this.audio = obj;
  }

  registerOnChange(fn: ((value: AudioAttachment) => void) | undefined): void {
    this.status.pipe(quietTakeUntilDestroyed(this.destroyRef)).subscribe(fn);
  }

  registerOnTouched(fn: ((value: AudioAttachment) => void) | undefined): void {
    this._onTouched.pipe(quietTakeUntilDestroyed(this.destroyRef)).subscribe(fn);
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

  saveRecording(): void {
    if (this.audio.status !== 'processed') {
      return;
    }
    this.dialogRef.close({ audio: this.audio });
  }

  startCountdown(mediaStream: MediaStream): void {
    // Start a countdown timer from 3 seconds to zero and then start recording
    const seconds = 3;
    const countdown$ = timer(0, 1000).pipe(
      take(seconds + 1),
      map(countdown => seconds - countdown)
    );

    countdown$.subscribe({
      next: value => {
        this.countdownTimer = value;
      },
      complete: () => {
        this.showCountdown = false;
        if (!this.destroyed) this.startRecording(mediaStream);
      }
    });
  }

  startRecording(mediaStream?: MediaStream): void {
    if (this.mediaDevicesUnsupported) {
      this.audio = { status: 'denied' };
      this.dialogService.openMatDialog(SupportedBrowsersDialogComponent, { data: BrowserIssue.AudioRecording });
      return;
    }
    if (mediaStream != null) {
      this.successCallback(mediaStream);
      return;
    }
    const mediaConstraints: MediaStreamConstraints = { audio: true };
    this.navigator.mediaDevices
      .getUserMedia(mediaConstraints)
      .then(this.successCallback.bind(this), this.errorCallback.bind(this));
  }

  async stopRecording(): Promise<void> {
    if (this.mediaRecorder == null || this.stream == null) {
      return;
    }
    this.refreshWaveformSub?.unsubscribe();
    this.canvasContext?.resetTransform();
    this.mediaRecorder.stop();
    this.stream.getAudioTracks().forEach(track => track.stop());
    this.audio = { status: 'stopped' };
    // Additional promise for when the audio has been processed and is available
    await new Promise<void>(resolve => {
      const statusPromise = this.status.subscribe((status: AudioAttachment) => {
        if (status.status === 'processed') {
          statusPromise.unsubscribe();
          resolve();
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

    // set up analyser node so we can visualize when a user is recording audio
    const audioCtx = new AudioContext();
    const analyser: AnalyserNode = audioCtx.createAnalyser();
    const source: MediaStreamAudioSourceNode = audioCtx.createMediaStreamSource(stream);
    const bufferLength: number = analyser.frequencyBinCount;
    const dataArray: Uint8Array = new Uint8Array(bufferLength);
    source.connect(analyser);

    this.initCanvasContext();
    this.canvasContext?.clearRect(0, 0, this.visualizerWidth, this.visualizerHeight);

    // draw the waveform to indicate the recording is working
    const drawWaveForm = (): void => {
      if (this.audio.status !== 'recording') return;
      analyser.getByteTimeDomainData(dataArray);
      this.drawOnCanvas(dataArray, bufferLength);
      this.addRippleEffect(dataArray);
    };

    const refreshRate: Observable<number> = interval(150);
    this.refreshWaveformSub = refreshRate.pipe(quietTakeUntilDestroyed(this.destroyRef)).subscribe(_ => drawWaveForm());
  }

  private initCanvasContext(): void {
    const canvas: HTMLCanvasElement | null = document.querySelector('.visualizer');
    if (canvas == null) return;
    this.visualizerWidth = canvas.width;
    this.visualizerHeight = canvas.height;
    this.canvasContext = canvas.getContext('2d');
    this.resetCanvasContext();
  }

  private drawOnCanvas(dataArray: Uint8Array, bufferLength: number): void {
    if (this.canvasContext == null) return;
    this.resetCanvasContext();
    this.canvasContext.lineWidth = 3;
    this.canvasContext.strokeStyle = 'rgb(200 0 0)';
    this.canvasContext.beginPath();

    const interval = 16;
    const sliceWidth = this.visualizerWidth / (bufferLength / interval);
    let x = 0;

    for (let i = 0; i < bufferLength; i += interval) {
      const value: number = dataArray[i] / this.audioWaveformBase - 0.95;
      const y = value * this.visualizerHeight;

      // draw the waveform line above and below the x-axis
      const mid = this.visualizerHeight / 2;
      this.canvasContext.moveTo(x, mid + y);
      this.canvasContext.lineTo(x, mid - y);

      x += sliceWidth;
    }

    this.canvasContext.stroke();
  }

  private resetCanvasContext(): void {
    if (this.canvasContext == null) return;
    this.canvasContext.fillStyle = 'white';
    this.canvasContext.fillRect(0, 0, this.visualizerWidth, this.visualizerHeight);
  }

  private addRippleEffect(dataArray: Uint8Array): void {
    const rippleContainerElement: HTMLElement | null = document.querySelector('#audioRecordContainer');
    if (rippleContainerElement == null) return;

    const waveformThreshold = 1.2;
    if (dataArray.some(v => Math.abs(v / this.audioWaveformBase) > waveformThreshold)) {
      // show the ripple animation when the waveform reaches the threshold
      const rippleElement: HTMLElement = document.createElement('div');
      rippleElement.classList.add('animate');
      rippleContainerElement.appendChild(rippleElement);
      // remove the div element after the 1s animation completes
      setTimeout(() => rippleElement.remove(), 1000);
    }
  }
}
