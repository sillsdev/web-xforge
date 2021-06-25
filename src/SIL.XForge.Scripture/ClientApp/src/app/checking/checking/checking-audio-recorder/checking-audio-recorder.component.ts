import { MdcDialog } from '@angular-mdc/web';
import { Component, EventEmitter, Inject, OnDestroy, OnInit, Output } from '@angular/core';
import { translate } from '@ngneat/transloco';
import RecordRTC from 'recordrtc';
import { NAVIGATOR } from 'xforge-common/browser-globals';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import {
  BrowserIssue,
  SupportedBrowsersDialogComponent
} from 'xforge-common/supported-browsers-dialog/supported-browsers-dialog.component';
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
  @Output() status = new EventEmitter<AudioAttachment>();
  audioUrl: string = '';
  mediaDevicesUnsupported: boolean = false;
  private stream?: MediaStream;
  private recordRTC?: RecordRTC;
  private user?: UserDoc;

  constructor(
    private readonly userService: UserService,
    private readonly noticeService: NoticeService,
    @Inject(NAVIGATOR) private readonly navigator: Navigator,
    private readonly dialog: MdcDialog
  ) {}

  get hasAudioAttachment(): boolean {
    return this.audioUrl !== '';
  }

  get isRecording(): boolean {
    return this.recordRTC != null && this.recordRTC.state === 'recording';
  }

  get recodingFileName(): string {
    return this.user == null || this.user.data == null ? '' : this.user.data.displayName + '.webm';
  }

  ngOnDestroy(): void {
    if (this.isRecording) {
      this.stopRecording();
    }
  }

  async ngOnInit(): Promise<void> {
    this.user = await this.userService.getCurrentUser();
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
      fileName: this.recodingFileName
    });
  }

  resetRecording(): void {
    this.audioUrl = '';
    this.status.emit({ status: 'reset' });
  }

  startRecording(): void {
    const mediaConstraints: MediaStreamConstraints = { audio: true };
    if (this.mediaDevicesUnsupported) {
      this.status.emit({ status: 'denied' });
      this.dialog.open(SupportedBrowsersDialogComponent, { data: BrowserIssue.audioRecording });
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

  private errorCallback(): void {
    this.status.emit({ status: 'denied' });
    this.noticeService.show(translate('checking_audio_recorder.mic_access_denied'));
  }

  private successCallback(stream: MediaStream): void {
    const options = {
      disableLogs: true,
      type: 'audio',
      mimeType: 'audio/webm',
      recorderType: RecordRTC.MediaStreamRecorder
    };
    // Fallback for devices not supporting the native Media Recording API i.e. Safari/iOS
    if (!window.hasOwnProperty('MediaRecorder')) {
      options.recorderType = RecordRTC.StereoAudioRecorder;
    }
    this.stream = stream;
    this.recordRTC = RecordRTC(stream, options);
    this.recordRTC.startRecording();
    this.status.emit({ status: 'recording' });
  }
}
