import { ErrorStateMatcher, MDC_DIALOG_DATA, MdcDialogRef } from '@angular-mdc/web';
import { MdcDialog, MdcDialogConfig } from '@angular-mdc/web';
import { Component, Inject, OnInit } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  FormGroupDirective,
  NgForm,
  ValidationErrors,
  Validators
} from '@angular/forms';
import { XFValidators } from 'xforge-common/xfvalidators';
import { Question } from '../../core/models/question';
import { ScrVers } from '../../core/models/scripture/scr-vers';
import { VerseRef } from '../../core/models/scripture/verse-ref';
import { TextsByBook } from '../../core/models/text-info';
import { VerseRefData } from '../../core/models/verse-ref-data';
import {
  ScriptureChooserDialogComponent,
  ScriptureChooserDialogData
} from '../../scripture-chooser-dialog/scripture-chooser-dialog.component';
import { SFValidators } from '../../shared/sfvalidators';

export interface QuestionDialogData {
  editMode: boolean;
  question: Question;
  textsByBook: TextsByBook;
}

export interface QuestionDialogResult {
  scriptureStart?: string;
  scriptureEnd?: string;
  text?: string;
}

@Component({
  templateUrl: './question-dialog.component.html',
  styleUrls: ['./question-dialog.component.scss']
})
export class QuestionDialogComponent implements OnInit {
  private static verseRefDataToString(verseRefData: VerseRefData): string {
    let result: string = verseRefData.book ? verseRefData.book : '';
    result += verseRefData.chapter ? ' ' + verseRefData.chapter : '';
    result += verseRefData.verse ? ':' + verseRefData.verse : '';
    return result;
  }

  private static verseRefToVerseRefData(input: VerseRef): VerseRefData {
    const refData: VerseRefData = {};
    refData.book = input.book;
    refData.chapter = input.chapter;
    refData.verse = input.verse;
    refData.versification = input.versification.name;
    return refData;
  }

  modeLabel = this.data && this.data.editMode ? 'Edit' : 'New';
  parentAndStartMatcher = new ParentAndStartErrorStateMatcher();
  questionForm: FormGroup = new FormGroup(
    {
      scriptureStart: new FormControl('', [Validators.required, SFValidators.verseStr(this.data.textsByBook)]),
      scriptureEnd: new FormControl('', [SFValidators.verseStr(this.data.textsByBook)]),
      questionText: new FormControl('', [Validators.required, XFValidators.someNonWhitespace])
    },
    this.validateVerseAfterStart
  );

  constructor(
    private readonly dialogRef: MdcDialogRef<QuestionDialogComponent, QuestionDialogResult>,
    @Inject(MDC_DIALOG_DATA) private data: QuestionDialogData,
    readonly dialog: MdcDialog
  ) {}

  get scriptureStart(): AbstractControl {
    return this.questionForm.controls.scriptureStart;
  }

  get scriptureEnd(): AbstractControl {
    return this.questionForm.controls.scriptureEnd;
  }

  get questionText(): AbstractControl {
    return this.questionForm.controls.questionText;
  }

  ngOnInit(): void {
    if (this.data && this.data.question) {
      const question = this.data.question;
      if (question.scriptureStart) {
        this.scriptureStart.setValue(QuestionDialogComponent.verseRefDataToString(question.scriptureStart));
      }
      if (question.scriptureEnd) {
        this.scriptureEnd.setValue(QuestionDialogComponent.verseRefDataToString(question.scriptureEnd));
      }
      if (question.text) {
        this.questionText.setValue(question.text);
      }
    }
  }

  submit(): void {
    if (this.questionForm.invalid) {
      return;
    }

    this.dialogRef.close({
      scriptureStart: this.scriptureStart.value,
      scriptureEnd: this.scriptureEnd.value,
      text: this.questionText.value
    });
  }

  /** Edit text of control using Scripture chooser dialog. */
  openScriptureChooser(control: AbstractControl) {
    const currentVerseSelection = QuestionDialogComponent.verseRefToVerseRefData(
      VerseRef.fromStr(control.value, ScrVers.English)
    );

    let rangeStart: VerseRefData;
    if (control !== this.scriptureStart) {
      rangeStart = QuestionDialogComponent.verseRefToVerseRefData(
        VerseRef.fromStr(this.scriptureStart.value, ScrVers.English)
      );
    }

    const dialogConfig: MdcDialogConfig<ScriptureChooserDialogData> = {
      data: { input: currentVerseSelection, booksAndChaptersToShow: this.data.textsByBook, rangeStart }
    };

    const dialogRef = this.dialog.open(ScriptureChooserDialogComponent, dialogConfig);
    dialogRef.afterClosed().subscribe((result: VerseRefData) => {
      if (result !== 'close') {
        control.setValue(QuestionDialogComponent.verseRefDataToString(result));
      }
    });
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
