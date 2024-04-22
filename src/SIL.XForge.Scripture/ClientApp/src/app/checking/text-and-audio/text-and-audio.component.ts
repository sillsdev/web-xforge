import { AfterViewInit, ChangeDetectorRef, Component, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { AbstractControl, UntypedFormControl, UntypedFormGroup } from '@angular/forms';
import { InvalidFileItem } from 'angular-file/file-upload/fileTools';
import {
  AudioAttachment,
  CheckingAudioRecorderComponent
} from '../checking/checking-audio-recorder/checking-audio-recorder.component';

const NOT_A_FILE = {} as File;

@Component({
  selector: 'app-text-and-audio',
  templateUrl: './text-and-audio.component.html',
  styleUrls: ['./text-and-audio.component.scss']
})
export class TextAndAudioComponent implements AfterViewInit, OnInit, OnDestroy {
  @ViewChild(CheckingAudioRecorderComponent) audioComponent?: CheckingAudioRecorderComponent;
  @Input() input?: { text?: string; audioUrl?: string };
  @Input() textLabel: string = '';
  @Input() uploadEnabled: boolean = false;
  suppressErrors: boolean = true;
  form = new UntypedFormGroup({
    text: new UntypedFormControl(''),
    audio: new UntypedFormControl({})
  });
  uploadAudioFile: File = NOT_A_FILE;

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

  get audio(): AbstractControl {
    return this.form.controls.audio;
  }

  get audioAttachment(): AudioAttachment {
    return this.audioComponent?.audio ?? {};
  }

  updateFormValidity(): void {
    if (this.hasTextOrAudio() || this.audioAttachment.status === 'recording') {
      this.text.setErrors(null);
      this.input!.audioUrl = this.audioAttachment.url;
    } else if (this.audioAttachment.status === 'reset') {
      this.input!.audioUrl = '';
    }
  }

  trim(event: any): void {
    this.text.setValue(event.target.value.trim());
  }

  hasAudio(): boolean {
    return this.audioComponent?.hasAudioAttachment ?? false;
  }

  isAudioPlaying(): boolean {
    return (this.hasAudio() && this.audioComponent?.audioPlayer?.playing) ?? false;
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
