import { AfterViewInit, ChangeDetectorRef, Component, Input, OnDestroy, ViewChild } from '@angular/core';
import { AbstractControl, UntypedFormControl, UntypedFormGroup } from '@angular/forms';
import { InvalidFileItem } from 'angular-file/file-upload/fileTools';
import { TextAudioValue } from 'realtime-server/lib/esm/scriptureforge/models/text-audio-value';
import {
  AudioAttachment,
  CheckingAudioRecorderComponent
} from '../checking/checking-audio-recorder/checking-audio-recorder.component';

const NOT_A_FILE = {} as File;

type AtLeastOne<T, U = { [K in keyof T]: Pick<T, K> }> = Partial<T> & U[keyof U];

type TextOrAudio = AtLeastOne<Required<TextAudioValue>>;

@Component({
  selector: 'app-text-and-audio',
  templateUrl: './text-and-audio.component.html',
  styleUrls: ['./text-and-audio.component.scss']
})
export class TextAndAudioComponent implements AfterViewInit, OnDestroy {
  @ViewChild(CheckingAudioRecorderComponent) audioComponent?: CheckingAudioRecorderComponent;
  @Input() input?: TextOrAudio;
  @Input() textLabel: string = '';
  @Input() uploadEnabled: boolean = false;
  suppressErrors: boolean = true;
  form = new UntypedFormGroup({
    text: new UntypedFormControl(''),
    audio: new UntypedFormControl({})
  });
  uploadAudioFile: File = NOT_A_FILE;

  constructor(private cdr: ChangeDetectorRef) {}

  ngAfterViewInit(): void {
    this.text.setValue(this.input?.text);
    this.audio.setValue({ url: this.input?.audioUrl });
    this.cdr.detectChanges();
  }

  ngOnDestroy(): void {
    this.form.reset();
  }

  get text(): AbstractControl {
    return this.form.controls.text;
  }

  get audio(): AbstractControl {
    return this.form.controls.audio;
  }

  get audioAttachment(): AudioAttachment {
    return this.audioComponent?.audio ?? {};
  }

  updateFormValidity(): void {
    if (this.hasTextOrAudio() || this.audioAttachment.status === 'recording') {
      this.text.setErrors(null);
    }
  }

  trim(event: any): void {
    this.text.setValue(event.target.value.trim());
  }

  hasAudio(): boolean {
    return this.audioComponent?.hasAudioAttachment ?? false;
  }

  hasTextOrAudio(): boolean {
    return this.text.value || this.hasAudio();
  }

  prepareAudioFileUpload(): void {
    if (this.uploadAudioFile.name != null && this.audioComponent) {
      this.audioComponent.audio = {
        url: URL.createObjectURL(this.uploadAudioFile),
        blob: this.uploadAudioFile,
        fileName: this.uploadAudioFile.name,
        status: 'uploaded'
      };
      this.text.setErrors(null);
    }
  }

  set lastInvalids(value: InvalidFileItem[]) {
    if (value == null) {
      return;
    }
    // Firefox does not recognize the valid .ogg file type because it reads it as a video, so handle it here
    if (value.length > 0 && value[0].file.type === 'video/ogg') {
      this.uploadAudioFile = value[0].file;
      this.prepareAudioFileUpload();
    }
  }
}
