import { AfterViewInit, ChangeDetectorRef, Component, Input, OnDestroy, OnInit } from '@angular/core';
import { AbstractControl, UntypedFormControl, UntypedFormGroup } from '@angular/forms';
import { AudioAttachment } from '../checking/checking-audio-player/checking-audio-player.component';

@Component({
  selector: 'app-text-and-audio',
  templateUrl: './text-and-audio.component.html',
  styleUrls: ['./text-and-audio.component.scss']
})
export class TextAndAudioComponent implements AfterViewInit, OnInit, OnDestroy {
  @Input() input?: { text?: string; audioUrl?: string };
  @Input() textLabel: string = '';

  suppressErrors: boolean = true;
  form = new UntypedFormGroup({
    text: new UntypedFormControl(''),
    audio: new UntypedFormControl({})
  });

  private _audioAttachment?: AudioAttachment;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    if (!this.input) {
      this.input = {};
    }
  }

  ngAfterViewInit(): void {
    this.text.setValue(this.input!.text);
    this.audio.setValue({ url: this.input!.audioUrl });
    this.cdr.detectChanges();
  }

  ngOnDestroy(): void {
    this.form.reset();
  }

  get text(): AbstractControl {
    return this.form.controls.text;
  }

  get audioAttachment(): AudioAttachment | undefined {
    return this._audioAttachment;
  }

  private get audio(): AbstractControl {
    return this.form.controls.audio;
  }

  updateFormValidity(): void {
    if (this.hasTextOrAudio() || this._audioAttachment?.status === 'processed') {
      this.text.setErrors(null);
      this.input!.audioUrl = this._audioAttachment?.url;
    } else if (this._audioAttachment?.status === 'reset') {
      this.input!.audioUrl = '';
    }
  }

  trim(event: any): void {
    this.text.setValue(event.target.value.trim());
  }

  hasAudio(): boolean {
    return !!this.input!.audioUrl;
  }

  hasTextOrAudio(): boolean {
    return this.text.value || this.hasAudio();
  }

  resetAudio(): void {
    this._audioAttachment = { status: 'reset' };
    this.updateFormValidity();
  }

  setAudioAttachment(audio: AudioAttachment): void {
    this._audioAttachment = audio;
    this.updateFormValidity();
  }
}
