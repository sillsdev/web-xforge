import { Component, Input, ViewChild } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { DialogService } from 'xforge-common/dialog.service';
import {
  AudioRecorderDialogComponent,
  AudioRecorderDialogData,
  AudioRecorderDialogResult
} from '../../shared/audio-recorder-dialog/audio-recorder-dialog.component';
import { SingleButtonAudioPlayerComponent } from '../checking/single-button-audio-player/single-button-audio-player.component';
import { TextAndAudioComponent } from '../text-and-audio/text-and-audio.component';

@Component({
  selector: 'app-attach-audio',
  templateUrl: './attach-audio.component.html',
  styleUrl: './attach-audio.component.scss'
})
export class AttachAudioComponent {
  @ViewChild(SingleButtonAudioPlayerComponent) audioPlayer?: SingleButtonAudioPlayerComponent;
  @Input() textAndAudio?: TextAndAudioComponent;

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
}
