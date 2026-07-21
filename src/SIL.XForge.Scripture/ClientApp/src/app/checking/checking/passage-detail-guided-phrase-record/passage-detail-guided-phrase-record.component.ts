import { MdcDialog } from '@angular-mdc/web';
import { Component, EventEmitter, Inject, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { translate } from '@ngneat/transloco';
import RecordRTC from 'recordrtc';
import { NAVIGATOR } from 'xforge-common/browser-globals';
import {
  ConfirmDialogComponent,
  ConfirmDialogData
} from 'xforge-common/confirm-dialog/confirm-dialog.component';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import {
  BrowserIssue,
  SupportedBrowsersDialogComponent
} from 'xforge-common/supported-browsers-dialog/supported-browsers-dialog.component';
import { UserService } from 'xforge-common/user.service';
import { AudioAttachment } from '../checking-audio-recorder/checking-audio-recorder.component';

@Component({
  selector: 'app-passage-detail-guided-phrase-record',
  templateUrl: './passage-detail-guided-phrase-record.component.html',
  styleUrls: ['./passage-detail-guided-phrase-record.component.scss']
})
export class PassageDetailGuidedPhraseRecordComponent implements OnInit, OnDestroy {
  @Input() phrases: string[] = [];
  @Output() recordingCleared = new EventEmitter<void>();
  @Output() recordingChanged = new EventEmitter<AudioAttachment>();

  audioUrl: string = '';
  currentPhraseIndex: number = 0;
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

  get currentPhrase(): string {
    return this.phrases[this.currentPhraseIndex] ?? '';
  }

  get hasAudioAttachment(): boolean {
    return this.audioUrl !== '';
  }

  get isRecording(): boolean {
    return this.recordRTC != null && this.recordRTC.state === 'recording';
  }

  get isLastPhrase(): boolean {
    return this.currentPhraseIndex >= this.phrases.length - 1;
  }

  get recordingFileName(): string {
    return this.user == null || this.user.data == null ? '' : this.user.data.displayName + '.webm';
  }

  ngOnDestroy(): void {
    if (this.isRecording) {
      void this.stopRecording();
    }
  }

  async ngOnInit(): Promise<void> {
    this.user = await this.userService.getCurrentUser();
    this.mediaDevicesUnsupported = this.navigator.mediaDevices?.getUserMedia == null;
  }

  async onClearRecording(): Promise<void> {
    const dialogRef = this.dialog.open<ConfirmDialogComponent, ConfirmDialogData>(ConfirmDialogComponent, {
      data: {
        title: () => translate('passage_detail_guided_phrase_record.confirm_clear_title'),
        message: () => translate('passage_detail_guided_phrase_record.confirm_clear_message'),
        confirmButton: () => translate('passage_detail_guided_phrase_record.confirm_clear_confirm'),
        cancelButton: () => translate('passage_detail_guided_phrase_record.confirm_clear_cancel')
      }
    });
    const result = await dialogRef.afterClosed().toPromise();
    if (result === 'confirmed') {
      this.resetRecording();
    }
  }

  nextPhrase(): void {
    if (!this.isLastPhrase) {
      this.currentPhraseIndex++;
      this.audioUrl = '';
    }
  }

  previousPhrase(): void {
    if (this.currentPhraseIndex > 0) {
      this.currentPhraseIndex--;
      this.audioUrl = '';
    }
  }

  processAudio(audioVideoWebMURL: string): void {
    if (this.recordRTC == null) {
      return;
    }
    this.audioUrl = audioVideoWebMURL;
    this.recordRTC.getDataURL(() => {});
    const attachment: AudioAttachment = {
      url: audioVideoWebMURL,
      status: 'processed',
      blob: this.recordRTC.getBlob(),
      fileName: this.recordingFileName
    };
    this.recordingChanged.emit(attachment);
  }

  startRecording(): void {
    if (this.mediaDevicesUnsupported) {
      this.dialog.open(SupportedBrowsersDialogComponent, { data: BrowserIssue.AudioRecording });
      return;
    }
    const mediaConstraints: MediaStreamConstraints = { audio: true };
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
  }

  private errorCallback(): void {
    this.noticeService.show(translate('checking_audio_recorder.mic_access_denied'));
  }

  private resetRecording(): void {
    this.audioUrl = '';
    this.recordRTC = undefined;
    this.stream = undefined;
    this.recordingCleared.emit();
  }

  private successCallback(stream: MediaStream): void {
    const options = {
      disableLogs: true,
      type: 'audio',
      mimeType: 'audio/webm',
      recorderType: RecordRTC.MediaStreamRecorder
    };
    if (!window.hasOwnProperty('MediaRecorder')) {
      options.recorderType = RecordRTC.StereoAudioRecorder;
    }
    this.stream = stream;
    this.recordRTC = RecordRTC(stream, options);
    this.recordRTC.startRecording();
  }
}
