import { Component, DestroyRef, Inject, OnInit, ViewChild } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogConfig, MatDialogRef } from '@angular/material/dialog';
import { VerseRef } from '@sillsdev/scripture';
import { cloneDeep } from 'lodash-es';
import { Question } from 'realtime-server/lib/esm/scriptureforge/models/question';
import { toStartAndEndVerseRefs } from 'realtime-server/lib/esm/scriptureforge/models/verse-ref-data';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nService } from 'xforge-common/i18n.service';
import { quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { QuestionDoc } from '../../core/models/question-doc';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { TextDocId } from '../../core/models/text-doc';
import { TextsByBookId } from '../../core/models/texts-by-book-id';
import {
  ScriptureChooserDialogComponent,
  ScriptureChooserDialogData
} from '../../scripture-chooser-dialog/scripture-chooser-dialog.component';
import { ParentAndStartErrorStateMatcher, SFValidators } from '../../shared/sfvalidators';
import { combineVerseRefStrs } from '../../shared/utils';
import { AudioAttachment } from '../checking/checking-audio-player/checking-audio-player.component';
import { TextAndAudioComponent } from '../text-and-audio/text-and-audio.component';
export interface QuestionDialogData {
  questionDoc?: QuestionDoc;
  projectDoc: SFProjectProfileDoc;
  textsByBookId: TextsByBookId;
  projectId: string;
  defaultVerse?: VerseRef;
  isRightToLeft?: boolean;
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
export class QuestionDialogComponent implements OnInit {
  @ViewChild(TextAndAudioComponent) textAndAudio?: TextAndAudioComponent;
  modeLabel =
    this.data && this.data.questionDoc != null
      ? this.i18n.translateStatic('question_dialog.edit_question')
      : this.i18n.translateStatic('question_dialog.new_question');
  parentAndStartMatcher = new ParentAndStartErrorStateMatcher();
  versesForm: FormGroup = new FormGroup(
    {
      scriptureStart: new FormControl('', [Validators.required, SFValidators.verseStr(this.data.textsByBookId)]),
      scriptureEnd: new FormControl('', [SFValidators.verseStr(this.data.textsByBookId)])
    },
    SFValidators.verseStartBeforeEnd
  );
  _selection?: VerseRef;

  private _question: Readonly<Question | undefined>;

  constructor(
    private readonly dialogRef: MatDialogRef<QuestionDialogComponent, QuestionDialogResult | 'close'>,
    @Inject(MAT_DIALOG_DATA) private data: QuestionDialogData,
    readonly i18n: I18nService,
    readonly dialogService: DialogService,
    private readonly destroyRef: DestroyRef
  ) {}

  get scriptureStart(): AbstractControl {
    return this.versesForm.controls.scriptureStart;
  }

  get scriptureEnd(): AbstractControl {
    return this.versesForm.controls.scriptureEnd;
  }

  get question(): Readonly<Question | undefined> {
    return this._question;
  }

  get textDocId(): TextDocId | undefined {
    if (this.scriptureStart.value && this.scriptureStart.valid) {
      const verseData = new VerseRef(this.scriptureStart.value);
      return new TextDocId(this.data.projectId, verseData.bookNum, verseData.chapterNum);
    }
    return undefined;
  }

  get selection(): VerseRef | undefined {
    return this._selection;
  }

  get scriptureInputErrorMessages(): { startError: string; endError: string } {
    let start: string = this.i18n.translateStatic('question_dialog.required_with_asterisk');
    if (this.scriptureStart.hasError('verseFormat')) {
      start = this.i18n.translateStatic('question_dialog.example_verse');
    } else if (this.scriptureStart.hasError('verseRange')) {
      start = this.i18n.translateStatic('question_dialog.must_be_inside_verse_range');
    }
    let end: string = '';
    if (this.scriptureEnd.hasError('verseFormat')) {
      end = this.i18n.translateStatic('question_dialog.example_verse');
    } else if (this.scriptureEnd.hasError('verseRange')) {
      end = this.i18n.translateStatic('question_dialog.must_be_inside_verse_range');
    } else if (this.versesForm.hasError('verseDifferentBookOrChapter')) {
      end = this.i18n.translateStatic('question_dialog.must_be_same_book_and_chapter');
    }
    return { startError: start, endError: end };
  }

  get isTextRightToLeft(): boolean {
    return this.data.isRightToLeft == null ? false : this.data.isRightToLeft;
  }

  get projectDoc(): SFProjectProfileDoc {
    return this.data.projectDoc;
  }

  ngOnInit(): void {
    this._question = cloneDeep(this.data.questionDoc?.data);
    if (this._question != null) {
      const { startVerseRef, endVerseRef } = toStartAndEndVerseRefs(this._question.verseRef);
      this.scriptureStart.setValue(startVerseRef.toString());
      if (endVerseRef != null) {
        this.scriptureEnd.setValue(endVerseRef.toString());
      }
      this.updateSelection();
    } else if (this.data.defaultVerse != null && this.data.defaultVerse.bookNum > 0) {
      const { startVerseRef, endVerseRef } = toStartAndEndVerseRefs(this.data.defaultVerse);
      this.scriptureStart.setValue(startVerseRef.toString());
      if (endVerseRef != null) {
        this.scriptureEnd.setValue(endVerseRef.toString());
      }
      this.updateSelection();
    }
    // set initial enabled/disabled state for scriptureEnd
    this.updateScriptureEndEnabled();

    this.scriptureStart.valueChanges.pipe(quietTakeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (this.scriptureStart.valid) {
        this.updateSelection();
      } else {
        this._selection = undefined;
      }
      // update enabled/disabled state for scriptureEnd
      this.updateScriptureEndEnabled();
    });
    this.scriptureEnd.valueChanges.pipe(quietTakeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (this.scriptureEnd.valid) {
        this.updateSelection();
      } else {
        this._selection = undefined;
      }
    });
  }

  updateSelection(): void {
    this._selection = combineVerseRefStrs(this.scriptureStart.value, this.scriptureEnd.value);
  }

  updateScriptureEndEnabled(): void {
    this.scriptureStart.valid ? this.scriptureEnd.enable() : this.scriptureEnd.disable();
  }

  async submit(): Promise<void> {
    if (this.textAndAudio != null) {
      this.textAndAudio.suppressErrors = false;
    }
    if (!this.textAndAudio?.hasTextOrAudio()) {
      this.textAndAudio?.text.markAsTouched();
      this.textAndAudio?.text.setErrors({ invalid: true });
      return;
    }

    if (this.versesForm.invalid || this._selection == null) {
      return;
    }

    this.dialogRef.close({
      verseRef: this._selection,
      text: this.textAndAudio.text.value,
      audio: this.textAndAudio.audioAttachment ?? {}
    });
  }

  /** Edit text of control using Scripture chooser dialog. */
  openScriptureChooser(control: AbstractControl): void {
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

    const dialogConfig: MatDialogConfig<ScriptureChooserDialogData> = {
      data: { input: currentVerseSelection, booksAndChaptersToShow: this.data.textsByBookId, rangeStart }
    };

    const dialogRef = this.dialogService.openMatDialog(ScriptureChooserDialogComponent, dialogConfig) as MatDialogRef<
      ScriptureChooserDialogComponent,
      VerseRef | 'close'
    >;
    if (control.value === '') {
      // the input element is losing focus, but the input is still being interacted with, so errors shouldn't be shown
      dialogRef.afterOpened().subscribe(() => {
        control.markAsUntouched();
      });
    }
    dialogRef.afterClosed().subscribe(result => {
      control.markAsTouched();
      if (result != null && result !== 'close') {
        control.markAsDirty();
        control.setValue(result.toString());
      }
    });
  }
}
