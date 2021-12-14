import { MdcDialog, MdcDialogRef } from '@angular-mdc/web';
import { CommonModule } from '@angular/common';
import { Component, Directive, NgModule, ViewChild, ViewContainerRef } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ngfModule } from 'angular-file';
import { CookieService } from 'ngx-cookie-service';
import { Answer } from 'realtime-server/lib/esm/scriptureforge/models/answer';
import { Question } from 'realtime-server/lib/esm/scriptureforge/models/question';
import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { fromVerseRef } from 'realtime-server/lib/esm/scriptureforge/models/verse-ref-data';
import { Canon } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/canon';
import { VerseRef } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/verse-ref';
import { Observable, of } from 'rxjs';
import { anything, capture, instance, mock, verify, when } from 'ts-mockito';
import { AuthService } from 'xforge-common/auth.service';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { QuestionDoc } from '../../core/models/question-doc';
import { TextsByBookId } from '../../core/models/texts-by-book-id';
import { SFProjectService } from '../../core/sf-project.service';
import { ScriptureChooserDialogComponent } from '../../scripture-chooser-dialog/scripture-chooser-dialog.component';
import { ImportQuestionsConfirmationDialogComponent } from './import-questions-confirmation-dialog/import-question-confirmation-dialog.component';
import {
  ImportQuestionsDialogComponent,
  ImportQuestionsDialogData,
  TransceleratorQuestion
} from './import-questions-dialog.component';

const mockedProjectService = mock(SFProjectService);
const mockedAuthService = mock(AuthService);
const mockedCookieService = mock(CookieService);
const mockedMdcDialog = mock(MdcDialog);

describe('ImportQuestionsDialogComponent', () => {
  configureTestingModule(() => ({
    imports: [ReactiveFormsModule, FormsModule, DialogTestModule],
    providers: [
      { provide: AuthService, useMock: mockedAuthService },
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: CookieService, useMock: mockedCookieService },
      { provide: MdcDialog, useMock: mockedMdcDialog }
    ]
  }));

  it('shows questions only from the books in the project', fakeAsync(() => {
    const env = new TestEnvironment();
    env.click(env.importFromTransceleratorButton);
    const questions = env.questionRows;
    expect(questions.length).toBe(2);
    expect(env.getRowReference(questions[0])).toBe('MAT 1:1-3');
    expect(env.getRowQuestion(questions[0])).toBe('Transcelerator question 1:1');
    expect(env.getRowReference(questions[1])).toBe('MAT 1:2');
    expect(env.getRowQuestion(questions[1])).toBe('Transcelerator question 1:2');
    env.click(env.cancelButton);
  }));

  it('can select questions in the list', fakeAsync(() => {
    const env = new TestEnvironment();
    env.click(env.importFromTransceleratorButton);
    const questions = env.questionRows;

    expect(env.component.filteredList[0].checked).toBe(false);
    expect(env.selectAllCheckbox.checked).toBe(false);
    expect(env.selectAllCheckbox.indeterminate).toBe(false);

    env.selectQuestion(questions[0]);
    expect(env.component.filteredList[0].checked).toBe(true);
    expect(env.selectAllCheckbox.checked).toBe(false);
    expect(env.selectAllCheckbox.indeterminate).toBe(true);

    // Selecting the second question should also check the select all checkbox
    env.selectQuestion(questions[1]);
    expect(env.component.filteredList[1].checked).toBe(true);
    expect(env.selectAllCheckbox.checked).toBe(true);
    expect(env.selectAllCheckbox.indeterminate).toBe(false);

    // Deselecting the first question should return the checkbox to indeterminate
    env.selectQuestion(questions[0]);
    expect(env.component.filteredList[0].checked).toBe(false);
    expect(env.selectAllCheckbox.checked).toBe(false);
    expect(env.selectAllCheckbox.indeterminate).toBe(true);
    env.click(env.cancelButton);
  }));

  it('select all selects and deselects all visible questions', fakeAsync(() => {
    const env = new TestEnvironment();
    env.click(env.importFromTransceleratorButton);
    env.clickSelectAll();
    expect(env.selectAllCheckbox.checked).toBe(true);
    expect(env.selectAllCheckbox.indeterminate).toBe(false);
    expect(env.component.filteredList[0].checked).toBe(true);
    expect(env.component.filteredList[1].checked).toBe(true);

    // Deselect questions
    env.clickSelectAll();
    expect(env.selectAllCheckbox.checked).toBe(false);
    expect(env.selectAllCheckbox.indeterminate).toBe(false);
    expect(env.component.filteredList[0].checked).toBe(false);
    expect(env.component.filteredList[1].checked).toBe(false);

    // Filter then select all
    env.setControlValue(env.component.filterControl, '1:1');
    env.clickSelectAll();
    expect(env.component.filteredList.length).toBe(1);
    expect(env.component.filteredList[0].checked).toBe(true);
    env.click(env.showAllButton);
    expect(env.selectAllCheckbox.checked).toBe(false);
    expect(env.selectAllCheckbox.indeterminate).toBe(true);
    env.clickSelectAll();
    expect(env.component.filteredList[0].checked).toBe(true);
    expect(env.component.filteredList[1].checked).toBe(true);
    env.click(env.cancelButton);
  }));

  it('can filter questions for text', fakeAsync(() => {
    const env = new TestEnvironment();
    env.click(env.importFromTransceleratorButton);
    expect(env.questionRows.length).toBe(2);
    env.setControlValue(env.component.filterControl, '1:2');
    expect(env.questionRows.length).toBe(1);
    env.click(env.cancelButton);
  }));

  it('clears text from filter when show all is clicked', fakeAsync(() => {
    const env = new TestEnvironment();
    env.click(env.importFromTransceleratorButton);
    env.setControlValue(env.component.filterControl, '1:1');
    env.click(env.showAllButton);
    expect(env.component.filterControl.value).toBe('');

    // from and to reference controls are also cleared
    env.setControlValue(env.component.fromControl, '1:2');
    env.setControlValue(env.component.toControl, 'MAT 2:1');
    env.click(env.showAllButton);
    expect(env.component.fromControl.value).toBe('');
    expect(env.component.toControl.value).toBe('');
    env.click(env.cancelButton);
  }));

  it('can filter questions with verse reference', fakeAsync(() => {
    const env = new TestEnvironment();
    env.click(env.importFromTransceleratorButton);
    expect(env.questionRows.length).toBe(2);
    env.setControlValue(env.component.fromControl, 'MAT 1:2');
    expect(env.questionRows.length).toBe(1);

    // Show 0 question if all questions previous to the input in fromControl
    env.setControlValue(env.component.fromControl, 'MAT 1:3');
    expect(env.questionRows.length).toBe(0);
    env.setControlValue(env.component.fromControl, '');
    expect(env.questionRows.length).toBe(2);

    // Show all question previous to the input in toControl
    env.setControlValue(env.component.toControl, 'MAT 1:1');
    expect(env.questionRows.length).toBe(1);
    env.setControlValue(env.component.toControl, 'MAL 1:1');
    expect(env.questionRows.length).toBe(0);
    env.click(env.cancelButton);
  }));

  it('show scripture chooser dialog', fakeAsync(() => {
    const env = new TestEnvironment();
    env.click(env.importFromTransceleratorButton);
    when(env.mockedScriptureChooserMdcDialogRef.afterClosed()).thenReturn(of(VerseRef.parse('MAT 1:1')));
    env.openFromScriptureChooser();
    verify(mockedMdcDialog.open(anything(), anything())).once();
    expect(env.component.fromControl.value).toBe('MAT 1:1');
    env.click(env.cancelButton);
  }));

  it('prompts for edited questions that have already been imported', fakeAsync(() => {
    const env = new TestEnvironment(true, false, [1, 4]);
    env.click(env.importFromTransceleratorButton);
    expect(env.questionRows.length).toBe(4);
    expect(env.component.filteredList[0].checked).toBe(false);
    expect(env.component.filteredList[1].checked).toBe(false);
    expect(env.component.filteredList[2].checked).toBe(false);
    expect(env.component.filteredList[3].checked).toBe(false);

    when(env.mockedImportQuestionsConfirmationMdcDialogRef.afterClosed()).thenReturn(of([false, false]));
    env.clickSelectAll();
    verify(mockedMdcDialog.open(anything(), anything())).once();
    expect(env.questionRows.length).toBe(4);
    expect(env.component.filteredList[0].checked).toBe(false);
    expect(env.component.filteredList[1].checked).toBe(false);
    expect(env.component.filteredList[2].checked).toBe(true);
    expect(env.component.filteredList[3].checked).toBe(true);
    env.click(env.cancelButton);
  }));

  it('allows updating questions that have been edited in Transcelerator', fakeAsync(() => {
    const env = new TestEnvironment(true, false, [1, 4]);
    when(env.mockedImportQuestionsConfirmationMdcDialogRef.afterClosed()).thenReturn(of([true, true]));
    env.click(env.importFromTransceleratorButton);
    expect(env.questionRows.length).toBe(4);
    env.clickSelectAll();
    verify(mockedMdcDialog.open(anything(), anything())).once();
    env.click(env.importSelectedQuestionsButton);
    expect(env.editedTransceleratorQuestionIds).toEqual(['1', '4']);
  }));

  it('should inform the user when Transcelerator version is unsupported', fakeAsync(() => {
    const env = new TestEnvironment(false, true);
    env.click(env.importFromTransceleratorButton);
    expect(env.bodyText).toEqual(
      'The version of Transcelerator used in this project is not supported. Please update to at least Transcelerator version 1.5.3.'
    );
    env.click(env.closeButton);
  }));

  it('should import questions that cover a verse range', fakeAsync(() => {
    const env = new TestEnvironment();
    env.click(env.importFromTransceleratorButton);
    env.selectQuestion(env.questionRows[0]);
    env.click(env.importSelectedQuestionsButton);
    verify(mockedProjectService.createQuestion('project01', anything(), undefined, undefined)).once();
    const question = capture(mockedProjectService.createQuestion).last()[1];
    expect(question.projectRef).toBe('project01');
    expect(question.text).toBe('Transcelerator question 1:1');
    expect(question.verseRef).toEqual({
      bookNum: 40,
      chapterNum: 1,
      verseNum: 1,
      verse: '1-3'
    });
    expect(question.transceleratorQuestionId).toBe('2');
  }));

  it('should properly import questions that are on a single verse', fakeAsync(() => {
    const env = new TestEnvironment();
    env.click(env.importFromTransceleratorButton);
    env.selectQuestion(env.questionRows[1]);
    env.click(env.importSelectedQuestionsButton);
    verify(mockedProjectService.createQuestion('project01', anything(), undefined, undefined)).once();
    const question = capture(mockedProjectService.createQuestion).last()[1];
    expect(question.verseRef).toEqual({
      bookNum: 40,
      chapterNum: 1,
      verseNum: 2,
      verse: undefined
    });
  }));

  it('should show validation error when form is submitted with no questions selected', fakeAsync(() => {
    const env = new TestEnvironment();
    env.click(env.importFromTransceleratorButton);
    expect(env.errorMessages).toEqual([]);
    env.click(env.importSelectedQuestionsButton);
    expect(env.errorMessages).toEqual(['Select questions to import']);

    env.selectQuestion(env.questionRows[1]);
    expect(env.errorMessages).toEqual([]);
    env.selectQuestion(env.questionRows[1]);
    expect(env.errorMessages).toEqual(['Select questions to import']);

    // Make valid and cleanup dialog
    env.selectQuestion(env.questionRows[1]);
    env.click(env.importSelectedQuestionsButton);
  }));

  it('does not import questions that were selected if they no longer match the filter', fakeAsync(() => {
    const env = new TestEnvironment();
    env.click(env.importFromTransceleratorButton);
    expect(env.questionRows.length).toBe(2);
    expect(env.importSelectedQuestionsButton.textContent).toContain('0');
    env.clickSelectAll();
    expect(env.importSelectedQuestionsButton.textContent).toContain('2');

    env.setControlValue(env.component.fromControl, 'MAT 1:2');
    expect(env.questionRows.length).toBe(1);
    expect(env.importSelectedQuestionsButton.textContent).toContain('1');

    env.click(env.importSelectedQuestionsButton);
    verify(mockedProjectService.createQuestion('project01', anything(), undefined, undefined)).once();
  }));

  it('allows canceling the import of questions', fakeAsync(() => {
    const env = new TestEnvironment();
    env.click(env.importFromTransceleratorButton);
    when(mockedProjectService.createQuestion('project01', anything(), undefined, undefined)).thenCall(
      () => new Promise(resolve => setTimeout(resolve, 5000))
    );
    expect(env.questionRows.length).toBe(2);
    expect(env.importSelectedQuestionsButton.textContent).toContain('0');
    env.clickSelectAll();
    expect(env.importSelectedQuestionsButton.textContent).toContain('2');

    // not using env.click(element) because it calls flush() which will not work with the timing in this test
    env.importSelectedQuestionsButton.click();

    tick(4000);
    verify(mockedProjectService.createQuestion('project01', anything(), undefined, undefined)).once();

    // cancel while the first question is still being imported
    env.cancelButton.click();
    tick(12000);
    verify(mockedProjectService.createQuestion('project01', anything(), undefined, undefined)).once();
  }));

  it('can import from a CSV file', async () => {
    const env = new TestEnvironment();

    const genQuestions = 'Genesis 1:1,Question for Genesis 1:1';
    const matQuestions = Array.from(Array(100), (_, i) => `MAT 1:${i + 1},Question for Matthew 1:${i + 1}`).join('\n');
    const file = new Blob([genQuestions + '\n' + matQuestions], { type: 'text/csv' }) as File;

    await env.component.fileSelected(file);

    env.fixture.detectChanges();
    expect(env.questionReferences.length).toBe(1);
    expect(env.questionReferences[0].textContent).toEqual('Genesis 1:1');
    env.continueImportButton.click();
    env.fixture.detectChanges();
    env.cancelButton.click();
    // Clean up the overlay container. Necessary because we can't do tick() so it's hard to clean up automatically.
    // Not sure whether this is a good idea, but it stops the error message saying it wasn't cleaned up.
    env.overlayContainerElement.innerHTML = '';
  });

  it('informs when there are no questions', fakeAsync(() => {
    const env = new TestEnvironment(false, false, [], []);
    env.click(env.importFromTransceleratorButton);
    expect(env.bodyText).toBe('There are no questions for the books in this project.');
    env.click(env.closeButton);
  }));

  it('does not say there are no questions when there are questions', fakeAsync(() => {
    const env = new TestEnvironment();
    env.click(env.importFromTransceleratorButton);
    expect(env.bodyText).not.toContain('There are no questions for the books in this project.');
    env.click(env.cancelButton);
  }));

  it('infinite scrolls questions', fakeAsync(() => {
    const questions: TransceleratorQuestion[] = Array.from(Array(200), (_, i) => ({
      book: 'MAT',
      startChapter: '1',
      startVerse: i + 1 + '',
      text: 'Question for verse ' + (i + 1),
      id: 'id_' + (i + 1)
    }));
    const env = new TestEnvironment(false, false, [], questions);
    env.click(env.importFromTransceleratorButton);
    expect(env.questionRows.length).toBe(100);
    env.scrollDialogContentBodyToBottom();
    expect(env.questionRows.length).toBe(125);
    env.scrollDialogContentBodyToBottom();
    expect(env.questionRows.length).toBe(150);
    env.click(env.cancelButton);
  }));
});

@Directive({
  // es lint complains that a directive should be used as an attribute
  // eslint-disable-next-line @angular-eslint/directive-selector
  selector: 'viewContainerDirective'
})
class ViewContainerDirective {
  constructor(public viewContainerRef: ViewContainerRef) {}
}

@Component({
  selector: 'app-view-container',
  template: '<viewContainerDirective></viewContainerDirective>'
})
class ChildViewContainerComponent {
  @ViewChild(ViewContainerDirective, { static: true }) viewContainer!: ViewContainerDirective;

  get childViewContainer(): ViewContainerRef {
    return this.viewContainer.viewContainerRef;
  }
}

@NgModule({
  imports: [CommonModule, UICommonModule, TestTranslocoModule, NoopAnimationsModule, ngfModule],
  declarations: [
    ViewContainerDirective,
    ChildViewContainerComponent,
    ScriptureChooserDialogComponent,
    ImportQuestionsDialogComponent
  ],
  exports: [
    ViewContainerDirective,
    ChildViewContainerComponent,
    ScriptureChooserDialogComponent,
    ImportQuestionsDialogComponent
  ]
})
class DialogTestModule {}

class TestEnvironment {
  fixture: ComponentFixture<ChildViewContainerComponent>;
  component: ImportQuestionsDialogComponent;
  dialogRef: MatDialogRef<ImportQuestionsDialogComponent>;
  mockedScriptureChooserMdcDialogRef = mock<MdcDialogRef<ScriptureChooserDialogComponent>>(MdcDialogRef);
  mockedImportQuestionsConfirmationMdcDialogRef =
    mock<MdcDialogRef<ImportQuestionsConfirmationDialogComponent>>(MdcDialogRef);
  editedTransceleratorQuestionIds: string[] = [];

  private questions: TransceleratorQuestion[] = [
    {
      book: 'GEN',
      startChapter: '41',
      startVerse: '39',
      endChapter: '42',
      endVerse: '2',
      text: 'This proposal pleased Pharaoh and all his servants',
      id: '1'
    },
    {
      book: 'GEN',
      startChapter: '43',
      startVerse: '1',
      text: 'Now the famine was severe in the land.',
      id: '4'
    },
    {
      book: 'MAT',
      startChapter: '1',
      startVerse: '1',
      endVerse: '3',
      text: 'Transcelerator question 1:1',
      id: '2'
    },
    {
      book: 'MAT',
      startChapter: '1',
      startVerse: '2',
      text: 'Transcelerator question 1:2',
      id: '3'
    }
  ];

  private existingQuestions: Readonly<QuestionDoc[]> = [];

  constructor(
    includeAllBooks = false,
    private errorOnFetchQuestions = false,
    editedQuestionIds: number[] = [],
    transceleratorQuestions?: TransceleratorQuestion[]
  ) {
    if (transceleratorQuestions != null) {
      this.questions = transceleratorQuestions;
    }
    this.fixture = TestBed.createComponent(ChildViewContainerComponent);
    this.simulateQuestionsAlreadyExisting(editedQuestionIds);
    this.setupTransceleratorQuestions();

    const gen: TextInfo = {
      bookNum: 1,
      chapters: [{ number: 41, lastVerse: 57, isValid: true, permissions: {} }],
      hasSource: false,
      permissions: {}
    };
    const mat: TextInfo = {
      bookNum: 40,
      chapters: [{ number: 1, lastVerse: 5, isValid: true, permissions: {} }],
      hasSource: false,
      permissions: {}
    };
    const textsByBookId: TextsByBookId = {};
    textsByBookId[Canon.bookNumberToId(mat.bookNum)] = mat;
    if (includeAllBooks) {
      textsByBookId[Canon.bookNumberToId(gen.bookNum)] = gen;
    }
    const configData: ImportQuestionsDialogData = {
      userId: 'user01',
      projectId: 'project01',
      textsByBookId
    };
    const config = { data: configData };
    this.dialogRef = TestBed.inject(MatDialog).open(ImportQuestionsDialogComponent, config);
    this.component = this.dialogRef.componentInstance;

    when(mockedMdcDialog.open(ScriptureChooserDialogComponent, anything())).thenReturn(
      instance<MdcDialogRef<ScriptureChooserDialogComponent>>(this.mockedScriptureChooserMdcDialogRef)
    );
    when(mockedMdcDialog.open(ImportQuestionsConfirmationDialogComponent, anything())).thenReturn(
      instance<MdcDialogRef<ImportQuestionsConfirmationDialogComponent>>(
        this.mockedImportQuestionsConfirmationMdcDialogRef
      )
    );
    this.fixture.detectChanges();
  }

  get overlayContainerElement(): HTMLElement {
    return this.fixture.nativeElement.parentElement.querySelector('.cdk-overlay-container');
  }

  get importFromTransceleratorButton(): HTMLButtonElement {
    return this.overlayContainerElement.querySelector('mat-card:first-child button') as HTMLButtonElement;
  }

  get importFromCsvFile(): HTMLButtonElement {
    return this.overlayContainerElement.querySelector('mat-card:last-child button') as HTMLButtonElement;
  }

  get questionRows(): HTMLElement[] {
    return Array.from(this.table.querySelectorAll('tbody tr')).map(r => r as HTMLElement);
  }

  get table(): HTMLElement {
    return this.overlayContainerElement.querySelector('table') as HTMLElement;
  }

  get questionReferences(): HTMLElement[] {
    return Array.from(this.overlayContainerElement.querySelectorAll('table[mat-table] tbody tr td:nth-child(2)'));
  }

  get selectAllCheckbox(): MatCheckbox {
    return this.component.selectAllCheckbox;
  }

  get dialogContentBody(): HTMLElement {
    return this.overlayContainerElement.querySelector('.dialog-content-body') as HTMLElement;
  }

  get bodyText(): string {
    return this.dialogContentBody.textContent || '';
  }

  get errorMessages(): string[] {
    return Array.from(this.overlayContainerElement.querySelectorAll('mat-error')).map(node =>
      (node.textContent || '').trim()
    );
  }

  get importSelectedQuestionsButton(): HTMLButtonElement {
    return this.overlayContainerElement.querySelector('#import-button') as HTMLButtonElement;
  }

  get cancelButton(): HTMLButtonElement {
    return this.getButtonByText('Cancel');
  }

  get showAllButton(): HTMLButtonElement {
    return this.getButtonByText('Show All');
  }

  get closeButton(): HTMLButtonElement {
    return this.getButtonByText('Close');
  }

  get continueImportButton(): HTMLButtonElement {
    return this.getButtonByText('Continue Import');
  }

  private getButtonByText(text: string): HTMLButtonElement {
    return Array.from(this.overlayContainerElement.querySelectorAll('button')).find(
      button => button.textContent!.trim().toLowerCase() === text.toLowerCase()
    ) as HTMLButtonElement;
  }

  clickSelectAll(): void {
    this.click(this.selectAllCheckbox._inputElement.nativeElement);
  }

  openFromScriptureChooser(): void {
    this.click(
      this.overlayContainerElement.querySelector('mdc-text-field[formControlName="from"] mdc-icon') as HTMLInputElement
    );
  }

  setControlValue(control: FormControl, value: string) {
    control.setValue(value);
    tick();
    this.fixture.detectChanges();
  }

  getRowReference(row: HTMLElement): string {
    return row.querySelector('td .mat-checkbox-label')?.textContent?.trim() || '';
  }

  getRowQuestion(row: HTMLElement): string {
    return row.querySelector('td:last-child')?.textContent || '';
  }

  selectQuestion(row: HTMLElement): void {
    this.click(row.querySelector('td mat-checkbox input') as HTMLInputElement);
  }

  scrollDialogContentBodyToBottom(): void {
    const scrollElement = this.dialogContentBody;
    scrollElement.scrollTo({ top: scrollElement.scrollHeight - scrollElement.clientHeight });
    // unfortunately the scroll event doesn't fire in the tests, so fire it manually
    this.component.dialogScroll();
    this.fixture.detectChanges();
    tick();
  }

  click(element: HTMLElement) {
    element.click();
    tick();
    this.fixture.detectChanges();
    flush();
  }

  private simulateQuestionsAlreadyExisting(ids: number[]): void {
    this.existingQuestions = ids.map(id => {
      const doc: TransceleratorQuestion = this.questions.find(question => question.id == id + '')!;
      const verse = doc.endVerse && !doc.endChapter ? doc.startVerse + '-' + doc.endVerse : doc.startVerse;
      return {
        data: {
          text: doc.text + ' [before edit]',
          transceleratorQuestionId: doc.id,
          answers: [] as Answer[],
          verseRef: fromVerseRef(new VerseRef(doc.book, doc.startChapter, verse))
        } as Question,
        submitJson0Op: (_: any) => {
          this.editedTransceleratorQuestionIds.push(doc.id);
        }
      } as QuestionDoc;
    });
  }

  private setupTransceleratorQuestions(): void {
    if (this.errorOnFetchQuestions) {
      when(mockedProjectService.transceleratorQuestions('project01')).thenReject(
        new Error('Transcelerator version unsupported')
      );
    } else {
      when(mockedProjectService.transceleratorQuestions('project01')).thenCall(() => Promise.resolve(this.questions));
    }
    when(mockedProjectService.queryQuestions('project01')).thenResolve({
      ready$: new Observable<void>(subscriber => {
        setTimeout(() => subscriber.next(), 0);
      }),
      dispose: () => {},
      docs: this.existingQuestions
    } as RealtimeQuery<QuestionDoc>);
  }
}
