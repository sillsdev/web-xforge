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
import { toStartAndEndVerseRefs } from 'realtime-server/lib/scriptureforge/models/verse-ref-data';
import { VerseRef } from 'realtime-server/lib/scriptureforge/scripture-utils/verse-ref';
import { NoticeService } from 'xforge-common/notice.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { XFValidators } from 'xforge-common/xfvalidators';
import { Anchorable } from '../../core/models/anchorable';
import { TextDocId } from '../../core/models/text-doc';
import { TextsByBookId } from '../../core/models/texts-by-book-id';
import {
  ScriptureChooserDialogComponent,
  ScriptureChooserDialogData
} from '../../scripture-chooser-dialog/scripture-chooser-dialog.component';
import { SFValidators } from '../../shared/sfvalidators';
import { CheckingAudioCombinedComponent } from '../checking/checking-audio-combined/checking-audio-combined.component';
import { AudioAttachment } from '../checking/checking-audio-recorder/checking-audio-recorder.component';

export interface QuestionDialogData {
  question?: Question;
  textsByBookId: TextsByBookId;
  projectId: string;
}

export interface QuestionDialogResult {
  verseRef: string;
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
      scriptureStart: new FormControl('', [Validators.required, SFValidators.verseStr(this.data.textsByBookId)]),
      scriptureEnd: new FormControl('', [SFValidators.verseStr(this.data.textsByBookId)]),
      questionText: new FormControl('', [Validators.required, XFValidators.someNonWhitespace])
    },
    this.validateVerseAfterStart
  );
  audio: AudioAttachment = {};
  _selection: Anchorable;

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
      const [startRef, endRef] = toStartAndEndVerseRefs(question.verseRef);
      this.scriptureStart.setValue(startRef.toString());
      if (endRef != null) {
        this.scriptureEnd.setValue(endRef.toString());
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

    this.subscribe(this.scriptureStart.valueChanges, () => {
      if (this.scriptureStart.valid) {
        this.updateSelection();
      }
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
    if (this.scriptureEnd.value !== '') {
      const scriptureEnd = VerseRef.parse(this.scriptureEnd.value);
      verseRefStr += `-${scriptureEnd.verse}`;
    }

    let verseRef = VerseRef.tryParse(verseRefStr);
    if (verseRef != null) {
      verseRef = verseRef.valid ? verseRef : undefined;
    }

    this._selection = { verseRef };
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
      verseRef: this._selection.verseRef.toString(),
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

    const currentVerseSelection = VerseRef.tryParse(control.value);

    let rangeStart: VerseRef;
    if (control !== this.scriptureStart) {
      rangeStart = VerseRef.tryParse(this.scriptureStart.value);
    }

    const dialogConfig: MdcDialogConfig<ScriptureChooserDialogData> = {
      data: { input: currentVerseSelection, booksAndChaptersToShow: this.data.textsByBookId, rangeStart }
    };

    const dialogRef = this.dialog.open(ScriptureChooserDialogComponent, dialogConfig);
    dialogRef.afterClosed().subscribe((result: VerseRef | 'close') => {
      if (result !== 'close') {
        control.markAsTouched();
        control.markAsDirty();
        control.setValue(result.toString());
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
    const scriptureStartRef = VerseRef.tryParse(group.controls.scriptureStart.value);
    const scriptureEndRef = VerseRef.tryParse(group.controls.scriptureEnd.value);
    if (
      scriptureStartRef == null ||
      scriptureEndRef == null ||
      group.controls.scriptureStart.errors ||
      group.controls.scriptureEnd.errors
    ) {
      return null;
    }
    if (scriptureStartRef.BBBCCC !== scriptureEndRef.BBBCCC) {
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
