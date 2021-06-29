import { MdcCheckbox, MdcDialog, MdcDialogRef } from '@angular-mdc/web';
import { CommonModule } from '@angular/common';
import { Component, Directive, NgModule, ViewChild, ViewContainerRef } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Answer } from 'realtime-server/lib/esm/scriptureforge/models/answer';
import { Question } from 'realtime-server/lib/esm/scriptureforge/models/question';
import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { VerseRefData } from 'realtime-server/lib/esm/scriptureforge/models/verse-ref-data';
import { Canon } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/canon';
import { VerseRef } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/verse-ref';
import { Observable, of } from 'rxjs';
import { anything, capture, instance, mock, spy, verify, when } from 'ts-mockito';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { QuestionDoc } from '../../core/models/question-doc';
import { TextsByBookId } from '../../core/models/texts-by-book-id';
import { SFProjectService } from '../../core/sf-project.service';
import { ScriptureChooserDialogComponent } from '../../scripture-chooser-dialog/scripture-chooser-dialog.component';
import {
  ImportQuestionsConfirmationDialogComponent,
  ImportQuestionsConfirmationDialogData
} from './import-questions-confirmation-dialog/import-question-confirmation-dialog.component';
import { ImportQuestionsDialogComponent, ImportQuestionsDialogData } from './import-questions-dialog.component';
import { TransceleratorQuestion } from './import-questions-dialog.component';

const mockedProjectService = mock(SFProjectService);

describe('ImportQuestionsDialogComponent', () => {
  configureTestingModule(() => ({
    imports: [ReactiveFormsModule, FormsModule, DialogTestModule],
    providers: [{ provide: SFProjectService, useMock: mockedProjectService }]
  }));

  it('shows questions only from the books in the project', fakeAsync(() => {
    const env = new TestEnvironment();
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
    expect(env.questionRows.length).toBe(2);
    env.setControlValue(env.component.filterControl, '1:2');
    expect(env.questionRows.length).toBe(1);
    env.click(env.cancelButton);
  }));

  it('clears text from filter when show all is clicked', fakeAsync(() => {
    const env = new TestEnvironment();
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
    when(env.mockedScriptureChooserMdcDialogRef.afterClosed()).thenReturn(of(VerseRef.parse('MAT 1:1')));
    env.openFromScriptureChooser();
    verify(env.dialogSpy.open(anything(), anything())).once();
    expect(env.component.fromControl.value).toBe('MAT 1:1');
    env.click(env.cancelButton);
  }));

  it('prompts for edited questions that have already been imported', fakeAsync(() => {
    const env = new TestEnvironment(true);
    expect(env.questionRows.length).toBe(4);
    expect(env.component.filteredList[0].checked).toBe(false);
    expect(env.component.filteredList[1].checked).toBe(false);
    expect(env.component.filteredList[2].checked).toBe(false);

    when(env.mockedImportQuestionsConfirmationMdcDialogRef.afterClosed()).thenReturn(
      of({
        questions: [
          {
            before: 'Transcelerator question 1:1 before edit',
            after: 'This proposal pleased Pharaoh and all his servants',
            checked: false
          }
        ]
      } as ImportQuestionsConfirmationDialogData)
    );
    env.clickSelectAll();
    verify(env.dialogSpy.open(anything(), anything())).once();
    expect(env.questionRows.length).toBe(4);
    expect(env.component.filteredList[0].checked).toBe(false);
    expect(env.component.filteredList[1].checked).toBe(true);
    expect(env.component.filteredList[2].checked).toBe(true);
    env.click(env.cancelButton);
  }));

  it('should inform the user when Transcelerator version is unsupported', fakeAsync(() => {
    const env = new TestEnvironment(false, true);
    expect(env.statusMessage).toEqual(
      // eslint-disable-next-line max-len
      'The version of Transcelerator used in this project is not supported. Please update to at least Transcelerator version 1.5.3.'
    );
    env.click(env.cancelButton);
  }));

  it('should import questions that cover a verse range', fakeAsync(() => {
    const env = new TestEnvironment();
    env.selectQuestion(env.questionRows[0]);
    env.click(env.submitButton);
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
    env.selectQuestion(env.questionRows[1]);
    env.click(env.submitButton);
    verify(mockedProjectService.createQuestion('project01', anything(), undefined, undefined)).once();
    const question = capture(mockedProjectService.createQuestion).last()[1];
    expect(question.verseRef).toEqual({
      bookNum: 40,
      chapterNum: 1,
      verseNum: 2
    });
  }));

  it('does not import questions that were selected if they no longer match the filter', fakeAsync(() => {
    const env = new TestEnvironment();
    expect(env.questionRows.length).toBe(2);
    expect(env.submitButton.textContent).toContain('0');
    env.clickSelectAll();
    expect(env.submitButton.textContent).toContain('2');

    env.setControlValue(env.component.fromControl, 'MAT 1:2');
    expect(env.questionRows.length).toBe(1);
    expect(env.submitButton.textContent).toContain('1');

    env.click(env.submitButton);
    verify(mockedProjectService.createQuestion('project01', anything(), undefined, undefined)).once();
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
  imports: [CommonModule, UICommonModule, TestTranslocoModule],
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
  dialogRef: MdcDialogRef<ImportQuestionsDialogComponent>;
  dialogSpy: MdcDialog;
  mockedScriptureChooserMdcDialogRef = mock<MdcDialogRef<ScriptureChooserDialogComponent>>(MdcDialogRef);
  mockedImportQuestionsConfirmationMdcDialogRef =
    mock<MdcDialogRef<ImportQuestionsConfirmationDialogComponent>>(MdcDialogRef);
  editedTransceleratorQuestionIds: string[] = [];

  constructor(includeAllBooks = false, private errorOnFetchQuestions = false) {
    this.fixture = TestBed.createComponent(ChildViewContainerComponent);
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
    this.dialogRef = TestBed.inject(MdcDialog).open(ImportQuestionsDialogComponent, config);
    this.component = this.dialogRef.componentInstance;

    // Set up MdcDialog mocking after it's already used above in creating the component.
    this.dialogSpy = spy(this.component.dialog);
    when(this.dialogSpy.open(ScriptureChooserDialogComponent, anything())).thenReturn(
      instance<MdcDialogRef<ScriptureChooserDialogComponent>>(this.mockedScriptureChooserMdcDialogRef)
    );
    when(this.dialogSpy.open(ImportQuestionsConfirmationDialogComponent, anything())).thenReturn(
      instance<MdcDialogRef<ImportQuestionsConfirmationDialogComponent>>(
        this.mockedImportQuestionsConfirmationMdcDialogRef
      )
    );
    this.fixture.detectChanges();
    tick();
    this.fixture.detectChanges();
  }

  get overlayContainerElement(): HTMLElement {
    return this.fixture.nativeElement.parentElement.querySelector('.cdk-overlay-container');
  }

  get questionRows(): HTMLElement[] {
    return Array.from(this.table.querySelectorAll('tbody tr')).map(r => r as HTMLElement);
  }

  get table(): HTMLElement {
    return this.overlayContainerElement.querySelector('table') as HTMLElement;
  }

  get selectAllCheckbox(): MdcCheckbox {
    return this.component.selectAllCheckbox;
  }

  get showAllButton(): HTMLButtonElement {
    return this.overlayContainerElement.querySelector('.filter-text div button') as HTMLButtonElement;
  }

  get statusMessage(): string {
    return this.overlayContainerElement.querySelector('p')?.textContent || '';
  }

  get submitButton(): HTMLButtonElement {
    return this.overlayContainerElement.querySelector('mdc-dialog-actions button[type="submit"]') as HTMLButtonElement;
  }

  get cancelButton(): HTMLButtonElement {
    return this.overlayContainerElement.querySelector(
      'mdc-dialog-actions button[mdcdialogaction="close"]'
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
    return row.querySelector('td mdc-form-field label')?.textContent || '';
  }

  getRowQuestion(row: HTMLElement): string {
    return row.querySelector('td.row-question')?.textContent || '';
  }

  selectQuestion(row: HTMLElement): void {
    this.click(row.querySelector('td mdc-checkbox input') as HTMLInputElement);
  }

  click(element: HTMLElement) {
    element.click();
    tick();
    this.fixture.detectChanges();
    flush();
  }

  private setupTransceleratorQuestions(): void {
    const questions: TransceleratorQuestion[] = [
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
    if (this.errorOnFetchQuestions) {
      when(mockedProjectService.transceleratorQuestions('project01')).thenReject(
        new Error('Transcelerator version unsupported')
      );
    } else {
      when(mockedProjectService.transceleratorQuestions('project01')).thenResolve(questions);
    }
    when(mockedProjectService.queryQuestions('project01')).thenResolve({
      ready$: new Observable<void>(subscriber => {
        setTimeout(() => subscriber.next(), 0);
      }),
      dispose: () => {},
      docs: [
        {
          data: {
            text: 'Transcelerator question 1:1 before edit',
            transceleratorQuestionId: '1',
            answers: [] as Answer[],
            verseRef: {
              bookNum: 1,
              chapterNum: 41,
              verseNum: 39
            } as VerseRefData
          } as Question,
          submitJson0Op: (_: any) => {
            this.editedTransceleratorQuestionIds.push('1');
          }
        } as QuestionDoc,
        {
          data: {
            text: 'Now the famine was severe in the land.',
            transceleratorQuestionId: '4',
            answers: [] as Answer[],
            verseRef: {
              bookNum: 1,
              chapterNum: 43,
              verseNum: 2
            } as VerseRefData
          } as Question,
          submitJson0Op: (_: any) => {
            this.editedTransceleratorQuestionIds.push('4');
          }
        } as QuestionDoc
      ] as Readonly<QuestionDoc[]>
    } as RealtimeQuery<QuestionDoc>);
  }
}
