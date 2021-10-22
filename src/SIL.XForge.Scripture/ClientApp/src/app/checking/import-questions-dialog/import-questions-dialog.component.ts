import { MdcDialog, MdcDialogConfig, MdcDialogRef } from '@angular-mdc/web';
import { Component, ElementRef, Inject, ViewChild } from '@angular/core';
import { AbstractControl, FormControl, FormGroup } from '@angular/forms';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Question } from 'realtime-server/lib/esm/scriptureforge/models/question';
import { toVerseRef, VerseRefData } from 'realtime-server/lib/esm/scriptureforge/models/verse-ref-data';
import { VerseRef } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/verse-ref';
import { first } from 'rxjs/operators';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { objectId } from 'xforge-common/utils';
import Papa from 'papaparse';
import { TranslocoService } from '@ngneat/transloco';
import { I18nService } from 'xforge-common/i18n.service';
import { ExternalUrlService } from 'xforge-common/external-url.service';
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

export interface SourceQuestion {
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
  question: SourceQuestion;
  checked: boolean;
  matchesFilter: boolean;
  sfVersionOfQuestion: QuestionDoc | null;
}

type DialogErrorState = 'update_transcelerator' | 'file_import_errors';
type DialogStatus = 'initial' | 'no_questions' | 'filter' | 'loading' | 'progress' | DialogErrorState;

@Component({
  templateUrl: './import-questions-dialog.component.html',
  styleUrls: ['./import-questions-dialog.component.scss']
})
export class ImportQuestionsDialogComponent extends SubscriptionDisposable {
  questionSource: null | 'transcelerator' | 'csv_file' = null;

  questionList: DialogListItem[] = [];
  filteredList: DialogListItem[] = [];
  invalidRows?: string[][];
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

  fromControl = new FormControl('', [SFValidators.verseStr()]);
  toControl = new FormControl('', [SFValidators.verseStr()]);
  filterControl = new FormControl();
  filterForm = new FormGroup({
    from: this.fromControl,
    to: this.toControl,
    filter: this.filterControl
  });

  promiseForTransceleratorQuestions: Promise<SourceQuestion[]>;
  promiseForQuestionDocQuery: Promise<RealtimeQuery<QuestionDoc>>;

  constructor(
    @Inject(MAT_DIALOG_DATA) public readonly data: ImportQuestionsDialogData,
    private readonly projectService: SFProjectService,
    private readonly dialogRef: MatDialogRef<ImportQuestionsDialogComponent>,
    private readonly transloco: TranslocoService,
    readonly mdcDialog: MdcDialog,
    readonly matDialog: MatDialog,
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
            this.verseRefFromQuestion(listItem.question),
            fromRef.success ? fromRef.verseRef : null,
            toRef.success ? toRef.verseRef : null
          );
      }
      this.updateListOfFilteredQuestions();
      this.updateSelectAllCheckbox();
    });

    this.promiseForTransceleratorQuestions = projectService.transceleratorQuestions(this.data.projectId).catch(err => {
      if (/Transcelerator version unsupported/.test(err.message)) {
        this.transceleratorOutdated = true;
        return [];
      } else {
        throw err;
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
    if (this.invalidRows != null) {
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
    return this.invalidRows!.slice(0, this.maxListItemsToDisplay);
  }

  get questionsForDisplay(): DialogListItem[] {
    return this.filteredList.slice(0, this.maxListItemsToDisplay);
  }

  get translocoInstructions(): string[] {
    return this.transloco.translate('import_questions_dialog.transcelerator_instructions').split('\n');
  }

  get csvInstructions(): string[] {
    return this.transloco.translate('import_questions_dialog.csv_instructions').split('\n');
  }

  dialogScroll(): void {
    if (this.status === 'file_import_errors' || this.status === 'filter') {
      const element = this.dialogContentBody.nativeElement;
      if (element.scrollHeight <= element.scrollTop + element.clientHeight + 1000) {
        const list = this.status === 'file_import_errors' ? this.invalidRows! : this.filteredList;
        this.maxListItemsToDisplay = Math.min(list.length, this.maxListItemsToDisplay + 25);
      }
    }
  }

  async setUpQuestionList(questions: SourceQuestion[]) {
    const questionQuery = await this.promiseForQuestionDocQuery;

    if (!questionQuery.ready) {
      await questionQuery.ready$.pipe(first()).toPromise();
    }
    questionQuery.dispose();

    questions.sort((a, b) => this.verseRefFromQuestion(a).BBBCCCVVV - this.verseRefFromQuestion(b).BBBCCCVVV);

    for (const question of questions.filter(q => this.data.textsByBookId[q.book] != null)) {
      const sfVersionOfQuestion =
        questionQuery.docs.find(
          doc =>
            doc.data != null &&
            doc.data.transceleratorQuestionId != null &&
            doc.data.transceleratorQuestionId === question.id &&
            // The id should be unique for a given verse, but not across different verses
            // Transcelerator does not allow changing the reference for a question, as of 2021-03-09
            !this.verseRefDataDiffers(doc.data.verseRef, this.verseRefData(question))
        ) || null;

      this.questionList.push({
        question,
        checked: false,
        matchesFilter: true,
        sfVersionOfQuestion
      });
    }
    this.updateListOfFilteredQuestions();
  }

  get showDuplicateImportNote(): boolean {
    return this.filteredList.some(item => item.checked && item.sfVersionOfQuestion != null);
  }

  referenceForDisplay(q: SourceQuestion): string {
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

    const dialogRef = this.mdcDialog.open(ScriptureChooserDialogComponent, dialogConfig) as MdcDialogRef<
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
      const verseRefData = this.verseRefData(listItem.question);
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
        await this.projectService.createQuestion(this.data.projectId, newQuestion, undefined, undefined);
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
    await this.setUpQuestionList(await this.promiseForTransceleratorQuestions);
    if (this.transceleratorOutdated) {
      this.errorState = 'update_transcelerator';
    }
    this.questionSource = 'transcelerator';
    this.loading = false;
  }

  async fileSelected(file: File) {
    this.loading = true;

    const result = await new Promise<Papa.ParseResult<string[]>>(resolve => Papa.parse(file, { complete: resolve }));

    let invalidRows: string[][] = [];
    const questions: SourceQuestion[] = [];

    for (const [index, row] of result.data.entries()) {
      try {
        const verse = VerseRef.parse(row[0]);
        questions.push({
          book: verse.book,
          startChapter: verse.chapter,
          startVerse: verse.verse,
          text: row[1],
          id: 'id for ' + row[1]
        });
      } catch {
        if (row.length > 1) {
          invalidRows.push([index + 1 + ''].concat(row));
        }
      }
    }

    invalidRows = invalidRows.filter(row => row.length > 1);
    if (invalidRows.length > 0) {
      this.invalidRows = invalidRows;
    }

    await this.setUpQuestionList(questions);
    this.questionSource = 'csv_file';
    this.loading = false;
  }

  private verseRefData(q: SourceQuestion): VerseRefData {
    const verse = this.verseRefFromQuestion(q);
    const verseRefData: VerseRefData = {
      bookNum: verse.bookNum,
      chapterNum: verse.chapterNum,
      verseNum: verse.verseNum
    };
    // TODO Right now ignoring end chapter and verse if it's in a different chapter, since we don't yet support that
    const sameChapter = q.endChapter == null || q.endChapter === q.startChapter;
    if (sameChapter && q.endVerse != null && q.endVerse !== q.startVerse) {
      verseRefData.verse = q.startVerse + '-' + q.endVerse;
    }
    return verseRefData;
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
    const dialogRef = this.mdcDialog.open(ImportQuestionsConfirmationDialogComponent, data) as MdcDialogRef<
      ImportQuestionsConfirmationDialogComponent,
      ImportQuestionsConfirmationDialogResult
    >;
    (await dialogRef.afterClosed().toPromise())!.questions.forEach(
      (result, index) => (changesToConfirm[index].checked = result.checked)
    );
    this.updateSelectAllCheckbox();
  }

  private questionsDiffer(listItem: DialogListItem) {
    const doc = listItem.sfVersionOfQuestion?.data;
    const q = listItem.question;
    return doc != null && (doc.text !== q.text || this.verseRefDataDiffers(doc.verseRef, this.verseRefData(q)));
  }

  private verseRefDataDiffers(a: VerseRefData, b: VerseRefData): boolean {
    return !toVerseRef(a).equals(toVerseRef(b));
  }

  private verseRefFromQuestion(question: SourceQuestion): VerseRef {
    return new VerseRef(question.book, question.startChapter, question.startVerse);
  }
}
