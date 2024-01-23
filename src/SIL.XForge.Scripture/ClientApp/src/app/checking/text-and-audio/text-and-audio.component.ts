import { AfterViewInit, ChangeDetectorRef, Component, Input, OnDestroy, ViewChild } from '@angular/core';
import { AbstractControl, UntypedFormControl, UntypedFormGroup } from '@angular/forms';
import { Answer } from 'realtime-server/lib/esm/scriptureforge/models/answer';
import {
  AudioAttachment,
  CheckingAudioRecorderComponent
} from '../checking/checking-audio-recorder/checking-audio-recorder.component';

@Component({
  selector: 'app-text-and-audio',
  templateUrl: './text-and-audio.component.html',
  styleUrls: ['./text-and-audio.component.scss']
})
export class TextAndAudioComponent implements AfterViewInit, OnDestroy {
  @ViewChild(CheckingAudioRecorderComponent) audioComponent?: CheckingAudioRecorderComponent;
  @Input() activeAnswer?: Answer;
  @Input() textLabel: string = '';
  suppressErrors: boolean = true;
  form = new UntypedFormGroup({
    text: new UntypedFormControl(),
    audio: new UntypedFormControl()
  });
  private _audioAttachment: AudioAttachment = {};

  constructor(private cdr: ChangeDetectorRef) {}

  ngAfterViewInit(): void {
    this.text.setValue(this.activeAnswer?.text);
    this.audio.setValue(this.activeAnswer?.audioUrl);
    this.cdr.detectChanges();
  }

  ngOnDestroy(): void {
    this.form.reset();
    this._audioAttachment = {};
  }

  get text(): AbstractControl {
    return this.form.controls.text;
  }

  get audio(): AbstractControl {
    return this.form.controls.audio;
  }

  get audioAttachment(): AudioAttachment {
    return this._audioAttachment;
  }

  processAudio(audio: AudioAttachment): void {
    this._audioAttachment = audio;
    this.updateFormValidity();
  }

  updateFormValidity(): void {
    if (this.hasTextOrAudio() || this._audioAttachment.status === 'recording') {
      this.text.setErrors(null);
    }
  }

  hasAudio(): boolean {
    return this.audioComponent?.audioUrl != null && this.audioComponent?.audioUrl !== '';
  }

  hasTextOrAudio(): boolean {
    return this.text.value || this.hasAudio();
  }
}
