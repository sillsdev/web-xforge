import { MDC_DIALOG_DATA, MdcDialog, MdcDialogConfig, MdcDialogRef } from '@angular-mdc/web/dialog';
import { AfterViewChecked, Component, ElementRef, Inject, OnInit, ViewChild } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, Validators } from '@angular/forms';
import { translate } from '@ngneat/transloco';
import { Question } from 'realtime-server/lib/scriptureforge/models/question';
import { toStartAndEndVerseRefs } from 'realtime-server/lib/scriptureforge/models/verse-ref-data';
import { VerseRef } from 'realtime-server/lib/scriptureforge/scripture-utils/verse-ref';
import { I18nService } from 'xforge-common/i18n.service';
import { NoticeService } from 'xforge-common/notice.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { verseSlug } from 'xforge-common/utils';
import { XFValidators } from 'xforge-common/xfvalidators';
import { TextDocId } from '../../core/models/text-doc';
import { TextsByBookId } from '../../core/models/texts-by-book-id';
import {
  ScriptureChooserDialogComponent,
  ScriptureChooserDialogData
} from '../../scripture-chooser-dialog/scripture-chooser-dialog.component';
import { ParentAndStartErrorStateMatcher, SFValidators } from '../../shared/sfvalidators';
import { combineVerseRefStrs } from '../../shared/utils';
import { CheckingAudioCombinedComponent } from '../checking/checking-audio-combined/checking-audio-combined.component';
import { AudioAttachment } from '../checking/checking-audio-recorder/checking-audio-recorder.component';
import { CheckingTextComponent } from '../checking/checking-text/checking-text.component';

export interface QuestionDialogData {
  question?: Question;
  textsByBookId: TextsByBookId;
  projectId: string;
  defaultVerse?: VerseRef;
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
export class QuestionDialogComponent extends SubscriptionDisposable implements OnInit, AfterViewChecked {
  @ViewChild(CheckingTextComponent, { static: false, read: ElementRef }) textElement?: ElementRef;
  @ViewChild(CheckingAudioCombinedComponent, { static: false }) audioCombinedComponent?: CheckingAudioCombinedComponent;
  modeLabel =
    this.data && this.data.question != null
      ? translate('question_dialog.edit_question')
      : translate('question_dialog.new_question');
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
  _selection?: VerseRef;

  // flag indicating whether we need to scroll verse into view at next opportunity
  private scrollVerseIntoView: boolean = false;

  constructor(
    private readonly dialogRef: MdcDialogRef<QuestionDialogComponent, QuestionDialogResult>,
    @Inject(MDC_DIALOG_DATA) private data: QuestionDialogData,
    private noticeService: NoticeService,
    readonly i18n: I18nService,
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

  get textDocId(): TextDocId | undefined {
    if (this.scriptureStart.value && this.scriptureStart.valid) {
      const verseData = VerseRef.parse(this.scriptureStart.value);
      return new TextDocId(this.data.projectId, verseData.bookNum, verseData.chapterNum);
    }
    return undefined;
  }

  get selection(): VerseRef | undefined {
    return this._selection;
  }

  get scriptureInputErrorMessages(): { startError: string; endError: string } {
    let start: string = translate('question_dialog.required_with_asterisk');
    if (this.scriptureStart.hasError('verseFormat')) {
      start = translate('question_dialog.example_verse');
    } else if (this.scriptureStart.hasError('verseRange')) {
      start = translate('question_dialog.must_be_inside_verse_range');
    }
    let end: string = '';
    if (this.scriptureEnd.hasError('verseFormat')) {
      end = translate('question_dialog.example_verse');
    } else if (this.scriptureEnd.hasError('verseRange')) {
      end = translate('question_dialog.must_be_inside_verse_range');
    } else if (this.questionForm.hasError('verseDifferentBookOrChapter')) {
      end = translate('question_dialog.must_be_same_book_and_chapter');
    }
    return { startError: start, endError: end };
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
    } else if (this.data.defaultVerse != null) {
      const { startVerseRef, endVerseRef } = toStartAndEndVerseRefs(this.data.defaultVerse);
      this.scriptureStart.setValue(startVerseRef.toString());
      if (endVerseRef != null) {
        this.scriptureEnd.setValue(endVerseRef.toString());
      }
      this.updateSelection();
    }
    // set initial enabled/disabled state for scriptureEnd
    this.updateScriptureEndEnabled();

    this.subscribe(this.scriptureStart.valueChanges, () => {
      if (this.scriptureStart.valid) {
        this.updateSelection();
      } else {
        this._selection = undefined;
      }
      // update enabled/disabled state for scriptureEnd
      this.updateScriptureEndEnabled();
    });
    this.subscribe(this.scriptureEnd.valueChanges, () => {
      if (this.scriptureEnd.valid) {
        this.updateSelection();
      } else {
        this._selection = undefined;
      }
    });
  }

  updateSelection() {
    this._selection = combineVerseRefStrs(this.scriptureStart.value, this.scriptureEnd.value);
    this.scrollVerseIntoView = true;
  }

  ngAfterViewChecked() {
    if (this.scrollVerseIntoView && this.selection != null) {
      const element = this.textElement!.nativeElement.querySelector(`[data-segment="${verseSlug(this.selection)}"]`);
      if (element != null) {
        setTimeout(() => element.scrollIntoView());
        this.scrollVerseIntoView = false;
      }
    }
  }

  updateScriptureEndEnabled() {
    this.scriptureStart.valid ? this.scriptureEnd.enable() : this.scriptureEnd.disable();
  }

  async submit() {
    if (this.audioCombinedComponent!.audioRecorderComponent != null && this.audio.status === 'recording') {
      await this.audioCombinedComponent!.audioRecorderComponent.stopRecording();
      this.noticeService.show(translate('question_dialog.recording_stopped'));
    }
    if (this.questionForm.invalid || this._selection == null) {
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

    let currentVerseSelection: VerseRef | undefined;
    const { verseRef } = VerseRef.tryParse(control.value);
    if (verseRef.valid) {
      currentVerseSelection = verseRef;
    }

    let rangeStart: VerseRef | undefined;
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
      if (result != null && result !== 'close') {
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
