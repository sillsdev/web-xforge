import { CdkScrollable } from '@angular/cdk/scrolling';
import { AsyncPipe, NgTemplateOutlet } from '@angular/common';
import { Component, DestroyRef, ElementRef, Inject, NgZone, OnDestroy, ViewChild } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatAnchor, MatButton, MatIconButton } from '@angular/material/button';
import { MatCard, MatCardActions, MatCardContent, MatCardTitle } from '@angular/material/card';
import { MatCheckbox } from '@angular/material/checkbox';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogConfig,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle
} from '@angular/material/dialog';
import { MatError, MatFormField, MatLabel, MatSuffix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatOption, MatSelect } from '@angular/material/select';
import {
  MatCell,
  MatCellDef,
  MatColumnDef,
  MatHeaderCell,
  MatHeaderCellDef,
  MatHeaderRow,
  MatHeaderRowDef,
  MatRow,
  MatRowDef,
  MatTable
} from '@angular/material/table';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import { Canon, VerseRef } from '@sillsdev/scripture';
import { ngfModule } from 'angular-file';
import { Question } from 'realtime-server/lib/esm/scriptureforge/models/question';
import { fromVerseRef, toVerseRef } from 'realtime-server/lib/esm/scriptureforge/models/verse-ref-data';
import { Subject } from 'rxjs';
import { CsvService } from 'xforge-common/csv-service.service';
import { DialogService } from 'xforge-common/dialog.service';
import { ExternalUrlService } from 'xforge-common/external-url.service';
import { I18nService } from 'xforge-common/i18n.service';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { RetryingRequest } from 'xforge-common/retrying-request.service';
import { quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { stripHtml } from 'xforge-common/util/string-util';
import { objectId } from 'xforge-common/utils';
import { environment } from '../../../environments/environment';
import { ParatextProject } from '../../core/models/paratext-project';
import { QuestionDoc } from '../../core/models/question-doc';
import { TextsByBookId } from '../../core/models/texts-by-book-id';
import { TransceleratorQuestion } from '../../core/models/transcelerator-question';
import { ParatextNote, ParatextNoteTag, ParatextService } from '../../core/paratext.service';
import { SFProjectService } from '../../core/sf-project.service';
import {
  ScriptureChooserDialogComponent,
  ScriptureChooserDialogData
} from '../../scripture-chooser-dialog/scripture-chooser-dialog.component';
import { SFValidators } from '../../shared/sfvalidators';
import { CheckingQuestionsService } from '../checking/checking-questions.service';
import {
  EditedQuestion,
  ImportQuestionsConfirmationDialogComponent,
  ImportQuestionsConfirmationDialogData,
  ImportQuestionsConfirmationDialogResult
} from './import-questions-confirmation-dialog/import-questions-confirmation-dialog.component';

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

type DialogErrorState =
  | 'update_transcelerator'
  | 'file_import_errors'
  | 'missing_header_row'
  | 'offline_conversion'
  | 'paratext_tag_load_error';
type DialogStatus =
  | 'initial'
  | 'no_questions'
  | 'filter_questions'
  | 'filter_notes'
  | 'loading'
  | 'progress'
  | 'paratext_tag_selection'
  | DialogErrorState;

@Component({
  templateUrl: './import-questions-dialog.component.html',
  styleUrls: ['./import-questions-dialog.component.scss'],
  imports: [
    TranslocoModule,
    MatDialogTitle,
    MatIconButton,
    MatDialogClose,
    MatIcon,
    CdkScrollable,
    MatDialogContent,
    MatCard,
    MatCardTitle,
    MatCardContent,
    MatCardActions,
    MatButton,
    MatAnchor,
    MatError,
    ngfModule,
    MatProgressSpinner,
    MatTable,
    MatColumnDef,
    MatHeaderCellDef,
    MatHeaderCell,
    MatCellDef,
    MatCell,
    MatHeaderRowDef,
    MatHeaderRow,
    MatRowDef,
    MatRow,
    FormsModule,
    ReactiveFormsModule,
    MatFormField,
    MatLabel,
    MatInput,
    MatSuffix,
    MatCheckbox,
    MatProgressBar,
    MatDialogActions,
    AsyncPipe,
    NgTemplateOutlet,
    MatSelect,
    MatOption
  ]
})
export class ImportQuestionsDialogComponent implements OnDestroy {
  questionSource: null | 'transcelerator' | 'csv_file' | 'paratext' = null;

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
  fileExtensions: string = '.csv,.tsv';

  showParatextTagSelector = false;
  paratextTagOptions: ParatextNoteTag[] = [];
  selectedParatextTagId: number | null = null;
  private paratextNotes: ParatextNote[] = [];
  private paratextProjectsPromise?: Promise<ParatextProject[] | undefined>;

  @ViewChild('selectAllCheckbox') selectAllCheckbox!: MatCheckbox;
  @ViewChild('dialogContentBody') dialogContentBody!: ElementRef;

  fromControl = new FormControl('', [SFValidators.verseStr()]);
  toControl = new FormControl('', [SFValidators.verseStr()]);
  filterControl = new FormControl('');
  filterForm = new FormGroup({
    from: this.fromControl,
    to: this.toControl,
    filter: this.filterControl
  });

  transceleratorRequest: RetryingRequest<TransceleratorQuestion[]>;
  promiseForTransceleratorQuestions: Promise<TransceleratorQuestion[] | undefined>;
  promiseForQuestionDocQuery: Promise<RealtimeQuery<QuestionDoc>>;
  helpInstructions = this.i18n.interpolate('import_questions_dialog.help_options');
  transceleratorInfo = this.i18n.interpolate('import_questions_dialog.transcelerator_paratext');

  constructor(
    private readonly destroyRef: DestroyRef,
    @Inject(MAT_DIALOG_DATA) public readonly data: ImportQuestionsDialogData,
    projectService: SFProjectService,
    private readonly paratextService: ParatextService,
    private readonly checkingQuestionsService: CheckingQuestionsService,
    private readonly onlineStatusService: OnlineStatusService,
    private readonly dialogRef: MatDialogRef<ImportQuestionsDialogComponent>,
    private readonly transloco: TranslocoService,
    private readonly dialogService: DialogService,
    private readonly zone: NgZone,
    private readonly csvService: CsvService,
    readonly i18n: I18nService,
    readonly urls: ExternalUrlService
  ) {
    this.filterForm.valueChanges.pipe(quietTakeUntilDestroyed(this.destroyRef)).subscribe(() => {
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

    const unsubscribe = new Subject<void>();
    this.destroyRef.onDestroy(() => unsubscribe.next());
    this.transceleratorRequest = projectService.transceleratorQuestions(this.data.projectId, unsubscribe);

    this.promiseForTransceleratorQuestions = this.transceleratorRequest.promiseForResult.catch((error: unknown) => {
      if (typeof error === 'object' && /Transcelerator version unsupported/.test(error?.['message'])) {
        this.transceleratorOutdated = true;
        return [];
      } else {
        throw error;
      }
    });

    this.promiseForQuestionDocQuery = checkingQuestionsService.queryQuestions(this.data.projectId, {}, this.destroyRef);

    // Filter the dialog to only allow uploading Excel files if the user is online
    this.onlineStatusService.onlineStatus$.pipe(quietTakeUntilDestroyed(this.destroyRef)).subscribe(isOnline => {
      if (isOnline) {
        this.fileExtensions = '.csv,.tsv,.xls,.xlsx';
      } else {
        this.fileExtensions = '.csv,.tsv';
      }
    });
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
    if (this.showParatextTagSelector) {
      return 'paratext_tag_selection';
    }
    if (this.invalidRows.length !== 0) {
      return 'file_import_errors';
    }
    if (this.questionSource != null) {
      if (this.questionList.length === 0) return 'no_questions';
      return this.selectedParatextTagId !== null ? 'filter_notes' : 'filter_questions';
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

  get paratextInstructions(): string[] {
    const importFromParatext = this.transloco.translate('import_questions_dialog.import_from_paratext');
    return this.i18n
      .translateAndInsertTags('import_questions_dialog.paratext_instructions', { importFromParatext })
      .split('\n');
  }

  get showDuplicateImportNote(): boolean {
    return this.filteredList.some(item => item.checked && item.sfVersionOfQuestion != null);
  }

  get showCloseIcon(): boolean {
    return this.status === 'initial' || this.status === 'loading';
  }

  ngOnDestroy(): void {
    void this.promiseForQuestionDocQuery.then(query => query.dispose());
  }

  dialogScroll(): void {
    if (this.status === 'file_import_errors' || this.status === 'filter_notes' || this.status === 'filter_questions') {
      const element = this.dialogContentBody.nativeElement;
      // add more list items if the user has scrolled to within 1000 pixels of the bottom of the list
      if (element.scrollHeight <= element.scrollTop + element.clientHeight + 1000) {
        const list = this.status === 'file_import_errors' ? this.invalidRows : this.filteredList;
        this.maxListItemsToDisplay = Math.min(list.length, this.maxListItemsToDisplay + 25);
      }
    }
  }

  async setUpQuestionList(questions: SourceQuestion[], useQuestionIds: boolean): Promise<void> {
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
          (useQuestionIds ? doc.data.transceleratorQuestionId === question.id : doc.data.text === question.text) &&
          toVerseRef(doc.data.verseRef).equals(question.verseRef)
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

  clearFilters(): void {
    this.fromControl.setValue('');
    this.toControl.setValue('');
    this.filterControl.setValue('');
  }

  updateListOfFilteredQuestions(): void {
    this.filteredList = this.questionList.filter(listItem => listItem.matchesFilter);
  }

  openScriptureChooser(control: AbstractControl): void {
    const dialogConfig: MatDialogConfig<ScriptureChooserDialogData> = {
      data: { booksAndChaptersToShow: this.data.textsByBookId }
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

  checkboxChanged(listItem: DialogListItem): void {
    this.updateSelectAllCheckbox();
    if (listItem.checked) {
      void this.confirmEditsIfNecessary([listItem]);
    }
  }

  async selectAllChanged(selectAllChecked: boolean): Promise<void> {
    const editsToConfirm: DialogListItem[] = [];
    for (const listItem of this.filteredList) {
      if (selectAllChecked && !listItem.checked) {
        editsToConfirm.push(listItem);
      }
      listItem.checked = selectAllChecked;
    }
    void this.confirmEditsIfNecessary(editsToConfirm);
  }

  updateSelectAllCheckbox(): void {
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
          this.checkingQuestionsService.createQuestion(this.data.projectId, newQuestion, undefined, undefined)
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

  async importFromTranscelerator(): Promise<void> {
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

  async importFromParatext(): Promise<void> {
    this.loading = true;
    this.importClicked = false;
    this.errorState = undefined;
    this.questionSource = 'paratext';
    this.questionList = [];
    this.filteredList = [];
    this.invalidRows = [];
    this.showParatextTagSelector = true;
    this.selectedParatextTagId = null;
    this.paratextNotes = [];
    this.paratextTagOptions = [];

    try {
      const paratextId = await this.getParatextProjectId();
      if (paratextId == null) {
        this.errorState = 'paratext_tag_load_error';
        return;
      }

      const notes = await this.paratextService.getNotes(paratextId);
      this.paratextNotes = notes ?? [];
      this.paratextTagOptions = this.collectParatextTagOptions(this.paratextNotes);
      if (this.paratextTagOptions.length > 0) {
        this.selectedParatextTagId = this.paratextTagOptions[0].id;
      }
    } catch (error) {
      console.error('Failed to load notes from Paratext: ', error);
      this.paratextNotes = [];
      this.paratextTagOptions = [];
      this.selectedParatextTagId = null;
      this.errorState = 'paratext_tag_load_error';
    } finally {
      this.loading = false;
    }
  }

  reset(): void {
    this.showParatextTagSelector = false;
    this.questionSource = null;
    this.errorState = undefined;
    this.paratextNotes = [];
    this.paratextTagOptions = [];
    this.selectedParatextTagId = null;
    this.importClicked = false;
  }

  async confirmParatextTagSelection(): Promise<void> {
    const tagId = this.selectedParatextTagId;
    if (tagId == null) {
      return;
    }

    this.loading = true;
    this.showParatextTagSelector = false;
    this.questionList = [];
    this.filteredList = [];
    this.invalidRows = [];
    this.errorState = undefined;

    const questions = this.convertParatextCommentsToQuestions(this.paratextNotes, tagId);
    await this.setUpQuestionList(questions, true);

    this.loading = false;
  }

  private async getParatextProjectId(): Promise<string | undefined> {
    try {
      this.paratextProjectsPromise ??= this.paratextService.getProjects();
      const projects = await this.paratextProjectsPromise;
      const project = projects?.find(p => p.projectId === this.data.projectId);
      return project?.paratextId;
    } catch (error) {
      console.error('Failed to load Paratext project list: ', error);
      this.paratextProjectsPromise = undefined;
      throw error;
    }
  }

  private collectParatextTagOptions(notes: ParatextNote[]): ParatextNoteTag[] {
    const tagMap = new Map<number, ParatextNoteTag>();
    for (const note of notes) {
      for (const comment of note.comments ?? []) {
        if (comment.tag != null && !tagMap.has(comment.tag.id)) {
          tagMap.set(comment.tag.id, comment.tag);
        }
      }
    }

    return Array.from(tagMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name, this.i18n.localeCode, { sensitivity: 'base' })
    );
  }

  private convertParatextCommentsToQuestions(notes: ParatextNote[], tagId: number): SourceQuestion[] {
    const questions: SourceQuestion[] = [];

    for (const note of notes) {
      const comments = note.comments ?? [];
      for (let index = 0; index < comments.length; index++) {
        const comment = comments[index];
        if (comment.tag == null || comment.tag.id !== tagId) {
          continue;
        }

        const verseRef = this.parseVerseReference(note.verseRef);
        if (verseRef == null) {
          continue;
        }

        const questionText = stripHtml(comment.content ?? '').trim();
        if (questionText.length === 0) {
          continue;
        }

        questions.push({
          id: note.id,
          verseRef,
          text: questionText
        });

        break;
      }
    }

    return questions;
  }

  private parseVerseReference(reference: string | undefined): VerseRef | null {
    if (reference == null) {
      return null;
    }

    const trimmedReference = reference.trim();
    if (trimmedReference.length === 0) {
      return null;
    }

    const parseResult = VerseRef.tryParse(trimmedReference);
    if (parseResult.success !== true || parseResult.verseRef == null) {
      return null;
    }

    return parseResult.verseRef;
  }

  async fileSelected(file: File): Promise<void> {
    this.loading = true;

    // extract the book id from the file name, if it exists (unfoldingWord puts the book id in the file name, and omits
    // it from the reference, with file names like tq_GEN.tsv, and references like 5:3)
    const possibleBookIds = file.name.split(/[-_.]/).filter(part => Canon.allBookIds.includes(part.toUpperCase()));
    const defaultBookId = possibleBookIds.length === 1 ? possibleBookIds[0].toUpperCase() : undefined;

    let result: string[][];
    const upperCaseFileName = file.name.toUpperCase();
    if (upperCaseFileName.endsWith('.XLS') || upperCaseFileName.endsWith('.XLSX')) {
      if (!this.onlineStatusService.isOnline) {
        this.errorState = 'offline_conversion';
        return;
      }

      result = await this.csvService.convert(file);
    } else {
      result = await this.csvService.parse(file);
    }

    const referenceColumn = result[0].findIndex(value => /^\s*References?\s*$/i.test(value));
    const questionColumn = result[0].findIndex(value => /^\s*Questions?\s*$/i.test(value));

    if (referenceColumn === -1 || questionColumn === -1) {
      this.questionSource = 'csv_file';
      this.errorState = 'missing_header_row';
      return;
    }

    const invalidRows: string[][] = [];
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
        invalidRows.push([rowNumber, reference, questionText]);
        continue;
      }
      try {
        // if the reference doesn't start with a book id, and the file name includes the book id, prepend the book id to
        // the reference
        const refStartsWithBook: boolean = Canon.allBookIds.includes(reference.slice(0, 3)) && reference[3] === ' ';
        const fullReference: string =
          refStartsWithBook || defaultBookId == null ? reference : defaultBookId + ' ' + reference;
        questions.push({
          verseRef: new VerseRef(fullReference),
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
      answerCount: change.sfVersionOfQuestion?.getAnswers().length || 0,
      checked: true
    }));

    if (edits.length === 0) {
      return;
    }

    const data: MatDialogConfig<ImportQuestionsConfirmationDialogData> = {
      data: { questions: edits },
      disableClose: true
    };
    const dialogRef = this.dialogService.openMatDialog(
      ImportQuestionsConfirmationDialogComponent,
      data
    ) as MatDialogRef<ImportQuestionsConfirmationDialogComponent, ImportQuestionsConfirmationDialogResult>;

    dialogRef.afterClosed().subscribe((result: ImportQuestionsConfirmationDialogResult | undefined) => {
      if (result != null) {
        result.forEach((checked, index) => (changesToConfirm[index].checked = checked));
      }
      this.updateSelectAllCheckbox();
    });
  }

  private questionsDiffer(listItem: DialogListItem): boolean {
    const doc = listItem.sfVersionOfQuestion?.data;
    const q = listItem.question;
    return doc != null && (doc.text !== q.text || !toVerseRef(doc.verseRef).equals(q.verseRef));
  }
}
