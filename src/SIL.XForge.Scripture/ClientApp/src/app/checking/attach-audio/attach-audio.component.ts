import { Component, Input, ViewChild } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { InvalidFileItem } from 'angular-file/file-upload/fileTools';
import { firstValueFrom } from 'rxjs';
import { DialogService } from 'xforge-common/dialog.service';
import {
  AudioRecorderDialogComponent,
  AudioRecorderDialogData,
  AudioRecorderDialogResult
} from '../../shared/audio-recorder-dialog/audio-recorder-dialog.component';
import { AudioAttachment } from '../checking/checking-audio-player/checking-audio-player.component';
import { SingleButtonAudioPlayerComponent } from '../checking/single-button-audio-player/single-button-audio-player.component';
import { TextAndAudioComponent } from '../text-and-audio/text-and-audio.component';

@Component({
    selector: 'app-attach-audio',
    templateUrl: './attach-audio.component.html',
    styleUrl: './attach-audio.component.scss',
    standalone: false
})
export class AttachAudioComponent {
  @ViewChild(SingleButtonAudioPlayerComponent) audioPlayer?: SingleButtonAudioPlayerComponent;
  @Input() textAndAudio?: TextAndAudioComponent;
  @Input() isUploadEnabled: boolean = false;

  protected uploadAudioFile: File = {} as File;

  constructor(private readonly dialogService: DialogService) {}

  get audioUrl(): string | undefined {
    return this.textAndAudio?.input?.audioUrl;
  }

  async startRecording(): Promise<void> {
    const config: AudioRecorderDialogData = { countdown: true };
    const recorderDialogRef: MatDialogRef<AudioRecorderDialogComponent, AudioRecorderDialogResult> =
      this.dialogService.openMatDialog<
        AudioRecorderDialogComponent,
        AudioRecorderDialogData,
        AudioRecorderDialogResult
      >(AudioRecorderDialogComponent, { data: config });
    const result: AudioRecorderDialogResult | undefined = await firstValueFrom(recorderDialogRef.afterClosed());
    if (result?.audio != null && this.textAndAudio != null) {
      this.textAndAudio.setAudioAttachment(result.audio);
    }
  }

  deleteAudio(): void {
    if (this.textAndAudio == null) return;
    this.textAndAudio.resetAudio();
  }

  toggleAudio(): void {
    this.audioPlayer?.playing ? this.audioPlayer?.stop() : this.audioPlayer?.play();
  }

  protected set lastInvalids(value: InvalidFileItem[]) {
    if (value == null) {
      return;
    }
    // Firefox does not recognize the valid .ogg file type because it reads it as a video, so handle it here
    if (value.length > 0 && value[0].file.type === 'video/ogg') {
      this.uploadAudioFile = value[0].file;
      this.processAudioFileUpload();
    }
  }

  protected processAudioFileUpload(): void {
    if (this.uploadAudioFile.name != null) {
      const audio: AudioAttachment = {};
      audio.url = URL.createObjectURL(this.uploadAudioFile);
      audio.blob = this.uploadAudioFile;
      audio.fileName = this.uploadAudioFile.name;
      audio.status = 'uploaded';

      if (this.textAndAudio != null) {
        this.textAndAudio.setAudioAttachment(audio);
      }
    }
  }
}
