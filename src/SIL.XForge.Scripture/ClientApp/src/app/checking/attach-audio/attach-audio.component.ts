import { Component, Input, ViewChild } from '@angular/core';
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

  constructor() {}

  startRecording(): void {
    this.textAndAudio?.audioComponent?.startRecording();
  }

  stopRecording(): void {
    this.textAndAudio?.audioComponent?.stopRecording();
  }

  deleteAudio(): void {
    this.textAndAudio?.audioComponent?.resetRecording();
  }

  toggleAudio(): void {
    this.audioPlayer?.playing ? this.audioPlayer?.stop() : this.audioPlayer?.play();
  }
}
