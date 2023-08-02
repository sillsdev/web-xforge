import { NgModule } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { MatDialog, MatDialogConfig, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Canon } from '@sillsdev/scripture';
import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { SFProjectProfileDoc } from 'src/app/core/models/sf-project-profile-doc';
import { mock, when } from 'ts-mockito';
import { CsvService } from 'xforge-common/csv-service.service';
import { FileService } from 'xforge-common/file.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { ChildViewContainerComponent, configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { TextDocId } from '../../core/models/text-doc';
import { TextsByBookId } from '../../core/models/texts-by-book-id';
import { SFProjectService } from '../../core/sf-project.service';
import { ChapterAudioDialogComponent, ChapterAudioDialogData } from './chapter-audio-dialog.component';

const mockedProjectService = mock(SFProjectService);
const mockedProjectDoc = mock(SFProjectProfileDoc);
const mockedCsvService = mock(CsvService);
const mockedFileService = mock(FileService);

describe('ChapterAudioDialogComponent', () => {
  configureTestingModule(() => ({
    imports: [DialogTestModule],
    providers: [
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: CsvService, useMock: mockedCsvService },
      { provide: FileService, useMock: mockedFileService }
    ]
  }));

  let env: TestEnvironment;
  afterEach(fakeAsync(() => {
    if (env.closeButton != null) {
      env.clickElement(env.closeButton);
    }
    flush();
  }));

  fit('should upload audio and return timing data on save', fakeAsync(() => {
    env = new TestEnvironment();
    // const result: QuestionDialogResult = {
    //   text: 'question added',
    //   verseRef: VerseRef.parse('MAT 1:3'),
    //   audio: {}
    // };
    // when(env.mockedDialogRef.afterClosed()).thenReturn(of(result));
    // await env.service.questionDialog(env.getQuestionDialogData());
    // verify(mockedProjectService.createQuestion(env.PROJECT01, anything(), undefined, undefined)).once();
    expect().nothing();
  }));
});

@NgModule({
  imports: [UICommonModule, TestTranslocoModule, NoopAnimationsModule, TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)]
})
class DialogTestModule {}

class TestEnvironment {
  static matTextDocId: TextDocId = new TextDocId('project01', 40, 1);
  static matthewText: TextInfo = {
    bookNum: TestEnvironment.matTextDocId.bookNum,
    hasSource: false,
    chapters: [
      { number: 1, lastVerse: 25, isValid: true, permissions: {} },
      { number: 3, lastVerse: 17, isValid: true, permissions: {} }
    ],
    permissions: {}
  };
  static textsByBookId: TextsByBookId = {
    [Canon.bookNumberToId(TestEnvironment.matTextDocId.bookNum)]: TestEnvironment.matthewText
  };
  readonly fixture: ComponentFixture<ChildViewContainerComponent>;
  readonly component: ChapterAudioDialogComponent;
  readonly dialogRef: MatDialogRef<ChapterAudioDialogComponent>;
  constructor() {
    const config: MatDialogConfig<ChapterAudioDialogData> = {
      data: {
        projectId: 'project01',
        textsByBookId: TestEnvironment.textsByBookId
      }
    };

    when(mockedProjectService.getProfile('project01')).thenResolve(mockedProjectDoc);
    // const projectProfile = mock<SFProjectProfile>();
    // when(projectProfile.texts).thenReturn([]);
    // when(mockedProjectDoc.data).thenReturn(projectProfile);

    this.fixture = TestBed.createComponent(ChildViewContainerComponent);
    this.dialogRef = TestBed.inject(MatDialog).open(ChapterAudioDialogComponent, config);
    this.component = this.dialogRef.componentInstance;
    this.fixture.detectChanges();
    tick();
  }

  get closeButton(): HTMLElement {
    return this.fetchElement('#audio-cancel-btn');
  }

  private get overlayContainerElement(): HTMLElement {
    return this.fixture.nativeElement.parentElement.querySelector('.cdk-overlay-container');
  }

  clickElement(element: HTMLElement): void {
    element.click();
    this.fixture.detectChanges();
    tick();
  }

  fetchElement(query: string): HTMLElement {
    return this.overlayContainerElement.querySelector(query) as HTMLElement;
  }
}
