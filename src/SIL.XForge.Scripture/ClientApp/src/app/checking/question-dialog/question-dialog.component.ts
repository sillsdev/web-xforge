import { MDC_DIALOG_DATA, MdcDialogRef } from '@angular-mdc/web';
import { MdcDialog, MdcDialogConfig } from '@angular-mdc/web';
import { Component, Inject, OnInit, ViewChild } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, Validators } from '@angular/forms';
import { Question } from 'realtime-server/lib/scriptureforge/models/question';
import { toStartAndEndVerseRefs } from 'realtime-server/lib/scriptureforge/models/verse-ref-data';
import { VerseRef } from 'realtime-server/lib/scriptureforge/scripture-utils/verse-ref';
import { NoticeService } from 'xforge-common/notice.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { XFValidators } from 'xforge-common/xfvalidators';
import { TextDocId } from '../../core/models/text-doc';
import { TextsByBookId } from '../../core/models/texts-by-book-id';
import {
  ScriptureChooserDialogComponent,
  ScriptureChooserDialogData
} from '../../scripture-chooser-dialog/scripture-chooser-dialog.component';
import { ParentAndStartErrorStateMatcher, SFValidators } from '../../shared/sfvalidators';
import { CheckingAudioCombinedComponent } from '../checking/checking-audio-combined/checking-audio-combined.component';
import { AudioAttachment } from '../checking/checking-audio-recorder/checking-audio-recorder.component';

export interface QuestionDialogData {
  question?: Question;
  textsByBookId: TextsByBookId;
  projectId: string;
}

export interface QuestionDialogResult {
  verseRef: VerseRef;
  text: string;
  audio: AudioAttachment;
}

@Component({
  templateUrl: './question-dialog.component.html',
  styleUrls: ['./question-dialog.component.scss']
})
export class QuestionDialogComponent extends SubscriptionDisposable implements OnInit {
  @ViewChild(CheckingAudioCombinedComponent, { static: true }) audioCombinedComponent: CheckingAudioCombinedComponent;
  modeLabel = this.data && this.data.question != null ? 'Edit' : 'New';
  parentAndStartMatcher = new ParentAndStartErrorStateMatcher();
  questionForm: FormGroup = new FormGroup(
    {
      scriptureStart: new FormControl('', [Validators.required, SFValidators.verseStr(this.data.textsByBookId)]),
      scriptureEnd: new FormControl('', [SFValidators.verseStr(this.data.textsByBookId)]),
      questionText: new FormControl('', [Validators.required, XFValidators.someNonWhitespace])
    },
    SFValidators.verseStartBeforeEnd
  );
  audio: AudioAttachment = {};
  _selection: VerseRef;

  constructor(
    private readonly dialogRef: MdcDialogRef<QuestionDialogComponent, QuestionDialogResult>,
    @Inject(MDC_DIALOG_DATA) private data: QuestionDialogData,
    private noticeService: NoticeService,
    readonly dialog: MdcDialog
  ) {
    super();
  }

  get scriptureStart(): AbstractControl {
    return this.questionForm.controls.scriptureStart;
  }

  get scriptureEnd(): AbstractControl {
    return this.questionForm.controls.scriptureEnd;
  }

  get questionText(): AbstractControl {
    return this.questionForm.controls.questionText;
  }

  get textDocId(): TextDocId {
    if (this.scriptureStart.value && this.scriptureStart.valid) {
      const verseData = VerseRef.parse(this.scriptureStart.value);
      return new TextDocId(this.data.projectId, verseData.bookNum, verseData.chapterNum);
    }
    return undefined;
  }

  get selection() {
    return this._selection;
  }

  ngOnInit(): void {
    const question = this.data.question;
    if (question != null) {
      const { startVerseRef, endVerseRef } = toStartAndEndVerseRefs(question.verseRef);
      this.scriptureStart.setValue(startVerseRef.toString());
      if (endVerseRef != null) {
        this.scriptureEnd.setValue(endVerseRef.toString());
      }
      if (question.text != null) {
        this.questionText.setValue(question.text);
      }
      if (question.audioUrl != null) {
        this.audio.url = question.audioUrl;
        this.questionText.clearValidators();
        this.questionText.updateValueAndValidity();
      }
      this.updateSelection();
    }
    // set initial enabled/disabled state for scriptureEnd
    this.updateScriptureEndEnabled();

    this.subscribe(this.scriptureStart.valueChanges, () => {
      if (this.scriptureStart.valid) {
        this.updateSelection();
      }
      // update enabled/disabled state for scriptureEnd
      this.updateScriptureEndEnabled();
    });
    this.subscribe(this.scriptureEnd.valueChanges, () => {
      if (this.scriptureEnd.valid) {
        this.updateSelection();
      }
    });
  }

  updateSelection() {
    if (this.textDocId == null) {
      this._selection = null;
    }

    let verseRefStr = this.scriptureStart.value;
    if (this.scriptureEnd.value !== '' && verseRefStr !== this.scriptureEnd.value) {
      const scriptureEnd = VerseRef.parse(this.scriptureEnd.value);
      verseRefStr += `-${scriptureEnd.verse}`;
    }

    const { verseRef } = VerseRef.tryParse(verseRefStr);
    this._selection = verseRef.valid ? verseRef : undefined;
  }

  updateScriptureEndEnabled() {
    this.scriptureStart.valid ? this.scriptureEnd.enable() : this.scriptureEnd.disable();
  }

  async submit() {
    if (this.audio.status === 'recording') {
      await this.audioCombinedComponent.audioRecorderComponent.stopRecording();
      this.noticeService.show('The recording for your question was automatically stopped.');
    }
    if (this.questionForm.invalid) {
      return;
    }

    this.dialogRef.close({
      verseRef: this._selection,
      text: this.questionText.value,
      audio: this.audio
    });
  }

  /** Edit text of control using Scripture chooser dialog. */
  openScriptureChooser(control: AbstractControl) {
    if (this.scriptureStart.value === '') {
      // the input element is losing focus, but the input is still being interacted with, so errors shouldn't be shown
      this.scriptureStart.markAsUntouched();
    }

    let currentVerseSelection: VerseRef;
    const { verseRef } = VerseRef.tryParse(control.value);
    if (verseRef.valid) {
      currentVerseSelection = verseRef;
    }

    let rangeStart: VerseRef;
    if (control !== this.scriptureStart) {
      const { verseRef: scriptureStartRef } = VerseRef.tryParse(this.scriptureStart.value);
      if (scriptureStartRef.valid) {
        rangeStart = scriptureStartRef;
      }
    }

    const dialogConfig: MdcDialogConfig<ScriptureChooserDialogData> = {
      data: { input: currentVerseSelection, booksAndChaptersToShow: this.data.textsByBookId, rangeStart }
    };

    const dialogRef = this.dialog.open(ScriptureChooserDialogComponent, dialogConfig) as MdcDialogRef<
      ScriptureChooserDialogComponent,
      VerseRef | 'close'
    >;
    dialogRef.afterClosed().subscribe(result => {
      if (result !== 'close') {
        control.markAsTouched();
        control.markAsDirty();
        control.setValue(result.toString());
      }
    });
  }

  processAudio(audio: AudioAttachment) {
    this.audio = audio;
    if (audio.status === 'uploaded' || audio.status === 'processed' || audio.status === 'recording') {
      this.questionText.clearValidators();
    } else if (audio.status === 'reset') {
      this.questionText.setValidators([Validators.required, XFValidators.someNonWhitespace]);
    }
    this.questionText.updateValueAndValidity();
  }
}
