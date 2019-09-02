import { ErrorStateMatcher, MDC_DIALOG_DATA, MdcDialogRef } from '@angular-mdc/web';
import { MdcDialog, MdcDialogConfig } from '@angular-mdc/web';
import { Component, Inject, OnInit, ViewChild } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  FormGroupDirective,
  NgForm,
  ValidationErrors,
  Validators
} from '@angular/forms';
import { Question } from 'realtime-server/lib/scriptureforge/models/question';
import { TextsByBook } from 'realtime-server/lib/scriptureforge/models/text-info';
import { VerseRefData } from 'realtime-server/lib/scriptureforge/models/verse-ref-data';
import { NoticeService } from 'xforge-common/notice.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { XFValidators } from 'xforge-common/xfvalidators';
import { ScriptureReference } from '../../core/models/scripture-reference';
import { TextDocId } from '../../core/models/text-doc';
import {
  ScriptureChooserDialogComponent,
  ScriptureChooserDialogData
} from '../../scripture-chooser-dialog/scripture-chooser-dialog.component';
import { ScrVers } from '../../shared/scripture-utils/scr-vers';
import { VerseRef } from '../../shared/scripture-utils/verse-ref';
import { verseRefDataToString, verseRefToVerseRefData } from '../../shared/scripture-utils/verse-ref-data-converters';
import { SFValidators } from '../../shared/sfvalidators';
import { CheckingAudioCombinedComponent } from '../checking/checking-audio-combined/checking-audio-combined.component';
import { AudioAttachment } from '../checking/checking-audio-recorder/checking-audio-recorder.component';

export interface QuestionDialogData {
  question?: Question;
  textsByBook: TextsByBook;
  projectId: string;
}

export interface QuestionDialogResult {
  scriptureStart?: string;
  scriptureEnd?: string;
  text?: string;
  audio?: AudioAttachment;
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
      scriptureStart: new FormControl('', [Validators.required, SFValidators.verseStr(this.data.textsByBook)]),
      scriptureEnd: new FormControl('', [SFValidators.verseStr(this.data.textsByBook)]),
      questionText: new FormControl('', [Validators.required, XFValidators.someNonWhitespace])
    },
    this.validateVerseAfterStart
  );
  audio: AudioAttachment = {};
  _scriptureRef: ScriptureReference;

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
      const verseData = VerseRef.fromStr(this.scriptureStart.value);
      return new TextDocId(this.data.projectId, verseData.book, verseData.chapterNum);
    }
    return undefined;
  }

  get scriptureRef() {
    return this._scriptureRef;
  }

  ngOnInit(): void {
    if (this.data && this.data.question) {
      const question = this.data.question;
      if (question.scriptureStart) {
        this.scriptureStart.setValue(verseRefDataToString(question.scriptureStart));
      }
      if (question.scriptureEnd) {
        this.scriptureEnd.setValue(verseRefDataToString(question.scriptureEnd));
      }
      if (question.text) {
        this.questionText.setValue(question.text);
      }
      if (question.audioUrl) {
        this.audio.url = question.audioUrl;
        this.questionText.clearValidators();
        this.questionText.updateValueAndValidity();
      }
      this.updateScriptureRef();
    }

    this.subscribe(this.scriptureStart.valueChanges, () => {
      if (this.scriptureStart.valid) {
        this.updateScriptureRef();
      }
    });
    this.subscribe(this.scriptureEnd.valueChanges, () => {
      if (this.scriptureEnd.valid) {
        this.updateScriptureRef();
      }
    });
  }

  updateScriptureRef() {
    if (this.textDocId == null) {
      this._scriptureRef = null;
    }
    const verseStart = VerseRef.fromStr(this.scriptureStart.value);
    const verseEnd = VerseRef.fromStr(this.scriptureEnd.value);
    this._scriptureRef = {
      scriptureStart: verseRefToVerseRefData(verseStart),
      scriptureEnd: verseRefToVerseRefData(verseEnd)
    };
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
      scriptureStart: this.scriptureStart.value,
      scriptureEnd: this.scriptureEnd.value,
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

    const currentVerseSelection = verseRefToVerseRefData(VerseRef.fromStr(control.value, ScrVers.English));

    let rangeStart: VerseRefData;
    if (control !== this.scriptureStart) {
      rangeStart = verseRefToVerseRefData(VerseRef.fromStr(this.scriptureStart.value, ScrVers.English));
    }

    const dialogConfig: MdcDialogConfig<ScriptureChooserDialogData> = {
      data: { input: currentVerseSelection, booksAndChaptersToShow: this.data.textsByBook, rangeStart }
    };

    const dialogRef = this.dialog.open(ScriptureChooserDialogComponent, dialogConfig);
    dialogRef.afterClosed().subscribe((result: VerseRefData | 'close') => {
      if (result !== 'close') {
        control.markAsTouched();
        control.markAsDirty();
        control.setValue(verseRefDataToString(result));
        this.updateScriptureEndEnabled();
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

  private validateVerseAfterStart(group: FormGroup): ValidationErrors | null {
    const scriptureStartRef = VerseRef.fromStr(group.controls.scriptureStart.value, ScrVers.English);
    const scriptureEndRef = VerseRef.fromStr(group.controls.scriptureEnd.value, ScrVers.English);
    if (
      !scriptureStartRef.valid ||
      !scriptureEndRef.valid ||
      group.controls.scriptureStart.errors ||
      group.controls.scriptureEnd.errors
    ) {
      return null;
    }
    if (
      scriptureStartRef.book !== scriptureEndRef.book ||
      scriptureStartRef.chapterNum !== scriptureEndRef.chapterNum
    ) {
      return { verseDifferentBookOrChapter: true };
    }
    const isAfterStart: boolean = scriptureStartRef.verseNum <= scriptureEndRef.verseNum;
    return isAfterStart ? null : { verseBeforeStart: true };
  }
}

class ParentAndStartErrorStateMatcher implements ErrorStateMatcher {
  isErrorState(control: FormControl | null, form: FormGroupDirective | NgForm | null): boolean {
    const invalidCtrl = !!(control && control.invalid && control.parent.dirty);
    const invalidStart = !!(
      control &&
      control.parent &&
      control.parent.controls &&
      control.parent.controls['scriptureStart'] &&
      control.parent.controls['scriptureStart'].dirty &&
      !control.parent.controls['scriptureStart'].hasError('verseFormat') &&
      !control.parent.controls['scriptureStart'].hasError('verseRange') &&
      (control.parent.controls['scriptureStart'].invalid ||
        control.parent.hasError('verseDifferentBookOrChapter') ||
        control.parent.hasError('verseBeforeStart'))
    );

    return control.touched && (invalidCtrl || invalidStart);
  }
}
