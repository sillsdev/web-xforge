import { MdcDialogConfig, MdcDialogRef } from '@angular-mdc/web';
import { Component, ElementRef, Inject, NgZone, OnDestroy, ViewChild } from '@angular/core';
import { AbstractControl, UntypedFormControl, UntypedFormGroup } from '@angular/forms';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatDialogConfig, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Question } from 'realtime-server/lib/esm/scriptureforge/models/question';
import { fromVerseRef, toVerseRef, VerseRefData } from 'realtime-server/lib/esm/scriptureforge/models/verse-ref-data';
import { VerseRef } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/verse-ref';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { objectId } from 'xforge-common/utils';
import { TranslocoService } from '@ngneat/transloco';
import { I18nService } from 'xforge-common/i18n.service';
import { ExternalUrlService } from 'xforge-common/external-url.service';
import { CsvService } from 'xforge-common/csv-service.service';
import { RetryingRequest } from 'xforge-common/retrying-request.service';
import { DialogService } from 'xforge-common/dialog.service';
import { Canon } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/canon';
import { environment } from '../../../environments/environment';
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

export interface TransceleratorQuestion {
  book: string;
  startChapter: string;
  startVerse: string;
  endChapter?: string;
  endVerse?: string;
  text: string;
  id: string;
}

export interface SourceQuestion {
  verseRef: VerseRef;
  text: string;
  id?: string;
}

export interface ImportQuestionsDialogData {
  projectId: string;
  userId: string;
  textsByBookId: TextsByBookId;
}

interface DialogListItem {
  question: SourceQuestion;
  checked: boolean;
  matchesFilter: boolean;
  sfVersionOfQuestion?: QuestionDoc;
}

type DialogErrorState = 'update_transcelerator' | 'file_import_errors' | 'missing_header_row';
type DialogStatus = 'initial' | 'no_questions' | 'filter' | 'loading' | 'progress' | DialogErrorState;

@Component({
  templateUrl: './import-questions-dialog.component.html',
  styleUrls: ['./import-questions-dialog.component.scss']
})
export class ImportQuestionsDialogComponent extends SubscriptionDisposable implements OnDestroy {
  questionSource: null | 'transcelerator' | 'csv_file' = null;

  questionList: DialogListItem[] = [];
  filteredList: DialogListItem[] = [];
  invalidRows: string[][] = [];
  errorState?: DialogErrorState;
  transceleratorOutdated = false;
  loading = false;
  importClicked: boolean = false;
  maxListItemsToDisplay = 100;

  importing: boolean = false;
  importedCount: number = 0;
  toImportCount: number = 0;
  importCanceled: boolean = false;

  @ViewChild('selectAllCheckbox') selectAllCheckbox!: MatCheckbox;
  @ViewChild('dialogContentBody') dialogContentBody!: ElementRef;

  fromControl = new UntypedFormControl('', [SFValidators.verseStr()]);
  toControl = new UntypedFormControl('', [SFValidators.verseStr()]);
  filterControl = new UntypedFormControl();
  filterForm = new UntypedFormGroup({
    from: this.fromControl,
    to: this.toControl,
    filter: this.filterControl
  });

  transceleratorRequest: RetryingRequest<TransceleratorQuestion[]>;
  promiseForTransceleratorQuestions: Promise<TransceleratorQuestion[] | undefined>;
  promiseForQuestionDocQuery: Promise<RealtimeQuery<QuestionDoc>>;

  constructor(
    @Inject(MAT_DIALOG_DATA) public readonly data: ImportQuestionsDialogData,
    private readonly projectService: SFProjectService,
    private readonly dialogRef: MatDialogRef<ImportQuestionsDialogComponent>,
    private readonly transloco: TranslocoService,
    private readonly dialogService: DialogService,
    private readonly zone: NgZone,
    private readonly csvService: CsvService,
    readonly i18n: I18nService,
    readonly urls: ExternalUrlService
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
            listItem.question.verseRef,
            fromRef.success ? fromRef.verseRef : null,
            toRef.success ? toRef.verseRef : null
          );
      }
      this.updateListOfFilteredQuestions();
      this.updateSelectAllCheckbox();
    });

    this.transceleratorRequest = projectService.transceleratorQuestions(this.data.projectId, this.ngUnsubscribe);

    this.promiseForTransceleratorQuestions = this.transceleratorRequest.promiseForResult.catch((error: unknown) => {
      if (typeof error === 'object' && /Transcelerator version unsupported/.test(error?.['message'])) {
        this.transceleratorOutdated = true;
        return [];
      } else {
        throw error;
      }
    });

    this.promiseForQuestionDocQuery = projectService.queryQuestions(this.data.projectId);
  }

  get status(): DialogStatus {
    if (this.errorState) {
      return this.errorState;
    }
    if (this.loading) {
      return 'loading';
    }
    if (this.importing) {
      return 'progress';
    }
    if (this.invalidRows.length !== 0) {
      return 'file_import_errors';
    }
    if (this.questionSource != null) {
      return this.questionList.length === 0 ? 'no_questions' : 'filter';
    } else {
      return 'initial';
    }
  }

  get selectedCount(): number {
    return this.filteredList.filter(question => question.checked).length;
  }

  get issueEmail(): string {
    return environment.issueEmail;
  }

  get invalidRowsForDisplay(): string[][] {
    return this.invalidRows.slice(0, this.maxListItemsToDisplay);
  }

  get questionsForDisplay(): DialogListItem[] {
    return this.filteredList.slice(0, this.maxListItemsToDisplay);
  }

  get transceleratorInstructions(): string[] {
    const importFromTranscelerator = this.transloco.translate('import_questions_dialog.import_from_transcelerator');
    return this.i18n
      .translateAndInsertTags('import_questions_dialog.transcelerator_instructions', { importFromTranscelerator })
      .split('\n');
  }

  get csvInstructions(): string[] {
    const importFromCsvFile = this.transloco.translate('import_questions_dialog.import_from_csv_file');
    return this.i18n
      .translateAndInsertTags('import_questions_dialog.csv_instructions', { importFromCsvFile })
      .split('\n');
  }

  get showDuplicateImportNote(): boolean {
    return this.filteredList.some(item => item.checked && item.sfVersionOfQuestion != null);
  }

  get showCloseIcon(): boolean {
    return this.status === 'initial' || this.status === 'loading';
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
    this.promiseForQuestionDocQuery.then(query => query.dispose());
  }

  dialogScroll(): void {
    if (this.status === 'file_import_errors' || this.status === 'filter') {
      const element = this.dialogContentBody.nativeElement;
      // add more list items if the user has scrolled to within 1000 pixels of the bottom of the list
      if (element.scrollHeight <= element.scrollTop + element.clientHeight + 1000) {
        const list = this.status === 'file_import_errors' ? this.invalidRows : this.filteredList;
        this.maxListItemsToDisplay = Math.min(list.length, this.maxListItemsToDisplay + 25);
      }
    }
  }

  async setUpQuestionList(questions: SourceQuestion[], useQuestionIds: boolean) {
    const questionQuery = await this.promiseForQuestionDocQuery;

    questions.sort((a, b) => a.verseRef.BBBCCCVVV - b.verseRef.BBBCCCVVV);

    for (const question of questions.filter(q => this.data.textsByBookId[q.verseRef.book] != null)) {
      // Questions imported from Transcelerator are considered duplicates if the ID and verse ref is the same. The
      // version in SF should be updated if the text is different from the version being imported. Transcelerator does
      // not allow changing the reference for a question, as of 2021-03-09
      // Questions imported from a file should be skipped only if they are exactly the same as what is currently in SF.
      const sfVersionOfQuestion: QuestionDoc | undefined = questionQuery.docs.find(
        doc =>
          doc.data != null &&
          !this.verseRefDataDiffers(doc.data.verseRef, fromVerseRef(question.verseRef)) &&
          (useQuestionIds ? doc.data.transceleratorQuestionId === question.id : doc.data.text === question.text)
      );

      this.questionList.push({
        question,
        checked: false,
        matchesFilter: true,
        sfVersionOfQuestion
      });
    }
    this.updateListOfFilteredQuestions();
  }

  referenceForDisplay(q: SourceQuestion): string {
    return q.verseRef.toString();
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
    const dialogConfig: MatDialogConfig<ScriptureChooserDialogData> = {
      data: { booksAndChaptersToShow: this.data.textsByBookId },
      autoFocus: false
    };

    const dialogRef = this.dialogService.openMatDialog(ScriptureChooserDialogComponent, dialogConfig) as MatDialogRef<
      ScriptureChooserDialogComponent,
      VerseRef | 'close'
    >;
    dialogRef.afterClosed().subscribe(result => {
      if (result != null && result !== 'close') {
        control.setValue(result.toString());
      }
    });
  }

  checkboxChanged(listItem: DialogListItem) {
    this.updateSelectAllCheckbox();
    if (listItem.checked) {
      this.confirmEditsIfNecessary([listItem]);
    }
  }

  async selectAllChanged(selectAllChecked: boolean) {
    const editsToConfirm: DialogListItem[] = [];
    for (const listItem of this.filteredList) {
      if (selectAllChecked && !listItem.checked) {
        editsToConfirm.push(listItem);
      }
      listItem.checked = selectAllChecked;
    }
    this.confirmEditsIfNecessary(editsToConfirm);
  }

  updateSelectAllCheckbox() {
    const checkedCount = this.filteredList.filter(item => item.checked).length;
    this.selectAllCheckbox.checked = checkedCount === this.filteredList.length;
    this.selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < this.filteredList.length;
  }

  async importQuestions(): Promise<void> {
    this.importClicked = true;

    if (this.selectedCount < 1) {
      return;
    }

    this.dialogRef.disableClose = true;
    this.importing = true;

    const listItems = this.filteredList.filter(listItem => listItem.checked);
    this.toImportCount = listItems.length;

    // Using Promise.all seems like a better choice than awaiting promises in a loop, but experimentally it appears to
    // take the same amount of time or significantly longer, especially with large numbers of questions, possibly due to
    // queuing too many tasks simultaneously. Additionally, running in series makes it much easier to track progress.
    for (const listItem of listItems) {
      const currentDate = new Date().toJSON();
      const verseRefData = fromVerseRef(listItem.question.verseRef);
      if (listItem.sfVersionOfQuestion == null) {
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
        await this.zone.runOutsideAngular(() =>
          this.projectService.createQuestion(this.data.projectId, newQuestion, undefined, undefined)
        );
      } else if (this.questionsDiffer(listItem)) {
        await listItem.sfVersionOfQuestion.submitJson0Op(op =>
          op
            .set(q => q.text!, listItem.question.text)
            .set(q => q.verseRef, verseRefData)
            .set(q => q.dateModified, currentDate)
        );
      }
      this.importedCount++;
      if (this.importCanceled) {
        break;
      }
    }

    this.dialogRef.close();
  }

  async importFromTranscelerator() {
    this.loading = true;

    await this.promiseForTransceleratorQuestions;

    if (this.transceleratorOutdated) {
      this.errorState = 'update_transcelerator';
    } else {
      const transceleratorQuestions: TransceleratorQuestion[] = this.transceleratorRequest.result || [];
      const sourceQuestions: SourceQuestion[] = transceleratorQuestions.map(q => {
        let verse = q.startVerse;
        if (
          q.endVerse != null &&
          q.endVerse !== q.startVerse &&
          (q.endChapter == null || q.endChapter === q.startChapter)
        ) {
          verse += '-' + q.endVerse;
        }
        return {
          verseRef: new VerseRef(q.book, q.startChapter, verse),
          text: q.text,
          id: q.id
        };
      });
      await this.setUpQuestionList(sourceQuestions, true);
    }
    this.questionSource = 'transcelerator';
    this.loading = false;
  }

  async fileSelected(file: File) {
    this.loading = true;

    // extract the book id from the file name, if it exists (unfoldingWord puts the book id in the file name, and omits
    // it from the reference, with file names like tq_GEN.tsv, and references like 5:3)
    const possibleBookIds = file.name.split(/[-_.]/).filter(part => Canon.allBookIds.includes(part.toUpperCase()));
    const defaultBookId = possibleBookIds.length === 1 ? possibleBookIds[0].toUpperCase() : undefined;

    const result = await this.csvService.parse(file);

    const referenceColumn = result[0].findIndex(value => /^\s*References?\s*$/i.test(value));
    const questionColumn = result[0].findIndex(value => /^\s*Questions?\s*$/i.test(value));

    if (referenceColumn === -1 || questionColumn === -1) {
      this.questionSource = 'csv_file';
      this.errorState = 'missing_header_row';
      return;
    }

    let invalidRows: string[][] = [];
    const questions: SourceQuestion[] = [];

    for (const [index, row] of result.entries()) {
      // skip the header row, and any row where every cell is the empty string
      if (index === 0 || row.every(cell => cell === '')) {
        continue;
      }
      const rowNumber: string = index + 1 + '';
      const reference: string | undefined = row[referenceColumn]?.trim();
      const questionText: string | undefined = row[questionColumn]?.trim();
      if (row.length < 2 || reference === '' || questionText === '') {
        invalidRows.push([rowNumber].concat(row));
        continue;
      }
      try {
        // if the reference doesn't start with a book id, and the file name includes the book id, prepend the book id to
        // the reference
        const refStartsWithBook: boolean = Canon.allBookIds.includes(reference.slice(0, 3)) && reference[3] === ' ';
        const fullReference: string =
          refStartsWithBook || defaultBookId == null ? reference : defaultBookId + ' ' + reference;
        questions.push({
          verseRef: VerseRef.parse(fullReference),
          text: questionText
        });
      } catch {
        invalidRows.push([rowNumber, reference, questionText]);
      }
    }

    if (invalidRows.length > 0) {
      this.invalidRows = invalidRows;
    }

    await this.setUpQuestionList(questions, false);
    this.questionSource = 'csv_file';
    this.loading = false;
  }

  // TODO should consider verse ranges, rather than just starting verse
  private isBetweenRefs(ref: VerseRef, from: VerseRef | null, to?: VerseRef | null): boolean {
    if ((from != null && from.BBBCCCVVV > ref.BBBCCCVVV) || (to != null && to.BBBCCCVVV < ref.BBBCCCVVV)) {
      return false;
    }
    return true;
  }

  private async confirmEditsIfNecessary(changes: DialogListItem[]): Promise<void> {
    const changesToConfirm = changes.filter(change => this.questionsDiffer(change));
    const edits: EditedQuestion[] = changesToConfirm.map(change => ({
      before:
        toVerseRef(change.sfVersionOfQuestion!.data!.verseRef).toString() +
        ' ' +
        change.sfVersionOfQuestion!.data!.text,
      after: this.referenceForDisplay(change.question) + ' ' + change.question.text,
      answerCount: change.sfVersionOfQuestion?.data?.answers.length || 0,
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
    const dialogRef = this.dialogService.openMdcDialog(
      ImportQuestionsConfirmationDialogComponent,
      data
    ) as MdcDialogRef<ImportQuestionsConfirmationDialogComponent, ImportQuestionsConfirmationDialogResult>;
    (await dialogRef.afterClosed().toPromise())!.forEach(
      (checked, index) => (changesToConfirm[index].checked = checked)
    );
    this.updateSelectAllCheckbox();
  }

  private questionsDiffer(listItem: DialogListItem) {
    const doc = listItem.sfVersionOfQuestion?.data;
    const q = listItem.question;
    return doc != null && (doc.text !== q.text || this.verseRefDataDiffers(doc.verseRef, fromVerseRef(q.verseRef)));
  }

  private verseRefDataDiffers(a: VerseRefData, b: VerseRefData): boolean {
    return !toVerseRef(a).equals(toVerseRef(b));
  }
}
