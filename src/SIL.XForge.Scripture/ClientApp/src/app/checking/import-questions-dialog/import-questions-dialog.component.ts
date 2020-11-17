import {
  MDC_DIALOG_DATA,
  MdcCheckboxChange,
  MDCDataTable,
  MdcDialog,
  MdcDialogConfig,
  MdcDialogRef
} from '@angular-mdc/web';
import { MdcCheckbox } from '@angular-mdc/web/checkbox';
import { Component, Inject, ViewChild } from '@angular/core';
import { AbstractControl, FormControl, FormGroup } from '@angular/forms';
import { Question } from 'realtime-server/lib/scriptureforge/models/question';
import { toVerseRef, VerseRefData } from 'realtime-server/lib/scriptureforge/models/verse-ref-data';
import { VerseRef } from 'realtime-server/lib/scriptureforge/scripture-utils/verse-ref';
import { first } from 'rxjs/operators';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { objectId } from 'xforge-common/utils';
import { QuestionDoc } from '../../core/models/question-doc';
import { TextsByBookId } from '../../core/models/texts-by-book-id';
import { SFProjectService } from '../../core/sf-project.service';
import {
  ScriptureChooserDialogComponent,
  ScriptureChooserDialogData
} from '../../scripture-chooser-dialog/scripture-chooser-dialog.component';
import { SFValidators } from '../../shared/sfvalidators';
import {
  EditedQuestion,
  ImportQuestionsConfirmationDialogComponent,
  ImportQuestionsConfirmationDialogData,
  ImportQuestionsConfirmationDialogResult
} from './import-questions-confirmation-dialog/import-question-confirmation-dialog.component';
import {
  ImportQuestionsProgressDialogComponent,
  ImportQuestionsProgressDialogData
} from './import-questions-progress-dialog/import-questions-progress-dialog.component';

export interface TransceleratorQuestion {
  book: string;
  startChapter: string;
  startVerse: string;
  endChapter?: string;
  endVerse?: string;
  text: string;
  id: string;
}

export interface ImportQuestionsDialogData {
  projectId: string;
  userId: string;
  textsByBookId: TextsByBookId;
}

interface DialogListItem {
  question: TransceleratorQuestion;
  checked: boolean;
  matchesFilter: boolean;
  alreadyImportedQuestion: QuestionDoc | null;
}

@Component({
  templateUrl: './import-questions-dialog.component.html',
  styleUrls: ['./import-questions-dialog.component.scss']
})
export class ImportQuestionsDialogComponent extends SubscriptionDisposable {
  questionList: DialogListItem[] = [];
  filteredList: DialogListItem[] = [];
  statusMessageKey: string | null = 'loading';

  @ViewChild('selectAllCheckbox') selectAllCheckbox!: MdcCheckbox;
  @ViewChild(MDCDataTable) dataTable?: MDCDataTable;

  fromControl = new FormControl('', [SFValidators.verseStr()]);
  toControl = new FormControl('', [SFValidators.verseStr()]);
  filterControl = new FormControl();
  filterForm = new FormGroup({
    from: this.fromControl,
    to: this.toControl,
    filter: this.filterControl
  });

  constructor(
    private readonly projectService: SFProjectService,
    @Inject(MDC_DIALOG_DATA) private readonly data: ImportQuestionsDialogData,
    private readonly dialogRef: MdcDialogRef<ImportQuestionsDialogComponent>,
    readonly dialog: MdcDialog
  ) {
    super();
    this.subscribe(this.filterForm.valueChanges, () => {
      const searchTerm: string = (this.filterControl.value || '').toLowerCase();
      const fromRef = VerseRef.tryParse(this.fromControl.value || '');
      const toRef = VerseRef.tryParse(this.toControl.value || '');
      for (const listItem of this.questionList) {
        listItem.matchesFilter =
          listItem.question.text.toLowerCase().includes(searchTerm) &&
          this.isBetweenRefs(
            new VerseRef(listItem.question.book, listItem.question.startChapter, listItem.question.startVerse),
            fromRef.success ? fromRef.verseRef : null,
            toRef.success ? toRef.verseRef : null
          );
      }
      this.updateListOfFilteredQuestions();
      this.updateSelectAllCheckbox();
    });
    this.setUpQuestionList();
  }

  get selectedCount() {
    return this.questionList.filter(question => question.checked).length;
  }

  async setUpQuestionList() {
    try {
      await this.fetchQuestions();
      this.updateListOfFilteredQuestions();
      this.statusMessageKey = this.questionList.length === 0 ? 'no_questions_available' : null;
    } catch (err) {
      if (/Transcelerator version unsupported/.test(err.message)) {
        this.statusMessageKey = 'update_transcelerator';
      } else {
        throw err;
      }
    }
  }

  async fetchQuestions() {
    const [transceleratorQuestions, questionQuery] = await Promise.all([
      this.projectService.transceleratorQuestions(this.data.projectId),
      this.projectService.queryQuestions(this.data.projectId)
    ]);

    if (!questionQuery.ready) {
      await questionQuery.ready$.pipe(first()).toPromise();
    }
    questionQuery.dispose();

    for (const question of transceleratorQuestions.filter(q => this.data.textsByBookId[q.book] != null)) {
      const alreadyImportedQuestion =
        questionQuery.docs.find(
          doc =>
            doc.data != null &&
            doc.data.transceleratorQuestionId != null &&
            doc.data.transceleratorQuestionId === question.id
        ) || null;

      this.questionList.push({
        question,
        checked: false,
        matchesFilter: true,
        alreadyImportedQuestion
      });
    }
    this.updateListOfFilteredQuestions();
  }

  referenceForDisplay(q: TransceleratorQuestion): string {
    const endPart = (q.endChapter ? `${q.endChapter}:` : '') + (q.endVerse || '');
    return `${q.book} ${q.startChapter}:${q.startVerse}${endPart ? '-' + endPart : ''}`;
  }

  clearFilters() {
    this.fromControl.setValue('');
    this.toControl.setValue('');
    this.filterControl.setValue('');
  }

  updateListOfFilteredQuestions() {
    this.filteredList = this.questionList.filter(listItem => listItem.matchesFilter);
  }

  openScriptureChooser(control: AbstractControl) {
    const dialogConfig: MdcDialogConfig<ScriptureChooserDialogData> = {
      data: { booksAndChaptersToShow: this.data.textsByBookId },
      autoFocus: false
    };

    const dialogRef = this.dialog.open(ScriptureChooserDialogComponent, dialogConfig) as MdcDialogRef<
      ScriptureChooserDialogComponent,
      VerseRef | 'close'
    >;
    dialogRef.afterClosed().subscribe(result => {
      if (result != null && result !== 'close') {
        control.setValue(result.toString());
      }
    });
  }

  checkboxChanged(event: MdcCheckboxChange, listItem: DialogListItem) {
    listItem.checked = event.checked;
    this.updateSelectAllCheckbox();
    if (event.checked) {
      this.confirmEditsIfNecessary([listItem]);
    }
  }

  async selectAllChanged(event: MdcCheckboxChange) {
    const editsToConfirm: DialogListItem[] = [];
    for (const listItem of this.filteredList) {
      if (event.checked && !listItem.checked) {
        editsToConfirm.push(listItem);
      }
      listItem.checked = event.checked;
    }
    this.confirmEditsIfNecessary(editsToConfirm);
  }

  updateSelectAllCheckbox() {
    const checkedCount = this.filteredList.filter(item => item.checked).length;
    if (checkedCount > 0 && checkedCount < this.filteredList.length) {
      this.selectAllCheckbox.indeterminate = true;
    } else {
      this.selectAllCheckbox.checked = checkedCount !== 0;
      this.selectAllCheckbox.indeterminate = false;
    }
  }

  importQuestions() {
    const listItems = this.questionList.filter(listItem => listItem.checked);
    const config: MdcDialogConfig<ImportQuestionsProgressDialogData> = {
      clickOutsideToClose: false,
      escapeToClose: false,
      data: { count: listItems.length }
    };
    const progressDialog = this.dialog.open(ImportQuestionsProgressDialogComponent, config);
    Promise.all(
      listItems.map(listItem => {
        const currentDate = new Date().toJSON();
        const verseRefData = this.verseRefData(listItem.question);
        if (listItem.alreadyImportedQuestion) {
          const doc = listItem.alreadyImportedQuestion.data;
          if (
            doc != null &&
            (doc.text !== listItem.question.text ||
              toVerseRef(doc.verseRef).BBBCCCVVV !== toVerseRef(verseRefData).BBBCCCVVV ||
              doc.verseRef.verse !== verseRefData.verse)
          ) {
            listItem.alreadyImportedQuestion.submitJson0Op(op =>
              op
                .set(q => q.text!, listItem.question.text)
                .set(q => q.verseRef, verseRefData)
                .set(q => q.dateModified, currentDate)
            );
          }
        } else {
          const newQuestion: Question = {
            dataId: objectId(),
            projectRef: this.data.projectId,
            ownerRef: this.data.userId,
            verseRef: verseRefData,
            text: listItem.question.text,
            audioUrl: undefined,
            answers: [],
            isArchived: false,
            dateCreated: currentDate,
            dateModified: currentDate,
            transceleratorQuestionId: listItem.question.id
          };
          return this.projectService.createQuestion(this.data.projectId, newQuestion, undefined, undefined);
        }
      })
    ).finally(() => {
      progressDialog.close();
      this.dialogRef.close();
    });
  }

  private verseRefData(q: TransceleratorQuestion): VerseRefData {
    const verse = new VerseRef(q.book, q.startChapter, q.startVerse);
    return {
      bookNum: verse.bookNum,
      chapterNum: verse.chapterNum,
      verseNum: verse.verseNum,
      verse:
        // TODO Right now ignoring end chapter and verse if it's in a different chapter, since we don't yet support that
        q.startChapter === q.endChapter && q.startVerse !== q.endVerse ? q.startVerse + '-' + q.endVerse : undefined
    };
  }

  // TODO should consider verse ranges, rather than just starting verse
  private isBetweenRefs(ref: VerseRef, from: VerseRef | null, to?: VerseRef | null): boolean {
    if ((from != null && from.BBBCCCVVV > ref.BBBCCCVVV) || (to != null && to.BBBCCCVVV < ref.BBBCCCVVV)) {
      return false;
    }
    return true;
  }

  private async confirmEditsIfNecessary(changes: DialogListItem[]): Promise<void> {
    const changesToConfirm = changes.filter(
      change =>
        change.alreadyImportedQuestion != null && change.question.text !== change.alreadyImportedQuestion.data?.text
    );
    const edits: EditedQuestion[] = changesToConfirm.map(change => ({
      before: change.alreadyImportedQuestion?.data?.text || '',
      after: change.question.text,
      answerCount: change.alreadyImportedQuestion?.data?.answers.length || 0,
      checked: true
    }));

    if (edits.length === 0) {
      return;
    }

    const data: MdcDialogConfig<ImportQuestionsConfirmationDialogData> = {
      data: { questions: edits },
      autoFocus: false,
      escapeToClose: false,
      clickOutsideToClose: false
    };
    const dialogRef = this.dialog.open(ImportQuestionsConfirmationDialogComponent, data) as MdcDialogRef<
      ImportQuestionsConfirmationDialogComponent,
      ImportQuestionsConfirmationDialogResult
    >;
    (await dialogRef.afterClosed().toPromise())!.questions.forEach(
      (result, index) => (changesToConfirm[index].checked = result.checked)
    );
    this.updateSelectAllCheckbox();
  }
}
