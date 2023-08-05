import { DebugElement, NgModule } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, flush, tick } from '@angular/core/testing';
import { MatDialog, MatDialogConfig, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Canon } from '@sillsdev/scripture';
import { ngfModule } from 'angular-file';
import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { QuestionDoc } from 'src/app/core/models/question-doc';
import { TextAudioDoc } from 'src/app/core/models/text-audio-doc';
import { TextDocId } from 'src/app/core/models/text-doc';
import { TextsByBookId } from 'src/app/core/models/texts-by-book-id';
import { anything, instance, mock, when } from 'ts-mockito';
import { CsvService } from 'xforge-common/csv-service.service';
import { DialogService } from 'xforge-common/dialog.service';
import { FileService } from 'xforge-common/file.service';
import { FileType } from 'xforge-common/models/file-offline-data';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { ChildViewContainerComponent, TestTranslocoModule, configureTestingModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { CheckingModule } from '../checking.module';
import { AudioAttachment } from '../checking/checking-audio-recorder/checking-audio-recorder.component';
import {
  ChapterAudioDialogComponent,
  ChapterAudioDialogData,
  ChapterAudioDialogResult
} from './chapter-audio-dialog.component';

const mockedDialogService = mock(DialogService);
const mockedCsvService = mock(CsvService);
const mockedFileService = mock(FileService);

describe('ChapterAudioDialogComponent', () => {
  configureTestingModule(() => ({
    imports: [DialogTestModule, TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)],
    providers: [
      { provide: DialogService, useMock: mockedDialogService },
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

  describe('Add Question', () => {
    it('should upload audio and return timing data on save', fakeAsync(async () => {
      env = new TestEnvironment();

      const blob = instance(mock(Blob));
      const audio: AudioAttachment = {
        status: 'uploaded',
        blob: blob,
        fileName: 'audio.mp3',
        url: ''
      };

      const promiseForResult: Promise<ChapterAudioDialogResult> = env.dialogRef.afterClosed().toPromise();

      env.component.prepareTimingFileUpload(anything());
      env.component.audioUpdate(audio);
      env.component.save();
      tick();
      env.fixture.detectChanges();
      flush();
      env.fixture.detectChanges();

      const result = await promiseForResult;

      expect(result.audioUrl).toEqual('audio url');
      expect(result.book).toEqual(env.component.book);
      expect(result.chapter).toEqual(env.component.chapter);
      expect(result.timingData.length > 0).toBeTruthy();
    }));

    it('should default selection to first chapter with question and no audio', fakeAsync(async () => {
      env = new TestEnvironment();

      const firstChapterWithQuestion = TestEnvironment.textsByBookId[
        Canon.bookNumberToId(env.question1.data?.verseRef.bookNum!)
      ].chapters.find(c => c.number === env.question1.data?.verseRef.chapterNum)!;

      expect(!firstChapterWithQuestion.hasAudio);
      expect(env.component.book).toEqual(env.question1.data?.verseRef.bookNum!);
      expect(env.component.chapter).toEqual(env.question1.data?.verseRef.chapterNum!);
    }));
  });
});

@NgModule({
  imports: [MatDialogModule, NoopAnimationsModule, UICommonModule, ngfModule, CheckingModule, TestTranslocoModule]
})
class DialogTestModule {}

class TestEnvironment {
  static genTextDocId: TextDocId = new TextDocId('project01', 1, 2);
  static genesisText: TextInfo = {
    bookNum: TestEnvironment.genTextDocId.bookNum,
    hasSource: false,
    chapters: [{ number: 2, lastVerse: 50, isValid: true, permissions: {} }],
    permissions: {}
  };
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
    [Canon.bookNumberToId(TestEnvironment.genTextDocId.bookNum)]: TestEnvironment.genesisText,
    [Canon.bookNumberToId(TestEnvironment.matTextDocId.bookNum)]: TestEnvironment.matthewText
  };

  readonly question1: QuestionDoc = {
    data: { text: 'Genesis 2:1 question', verseRef: { bookNum: 1, chapterNum: 2, verseNum: 1 } }
  } as QuestionDoc;
  readonly question2: QuestionDoc = {
    data: { text: 'Matthew 1:1 question', verseRef: { bookNum: 40, chapterNum: 1, verseNum: 1 } }
  } as QuestionDoc;
  readonly questions = [this.question1, this.question2];

  readonly fixture: ComponentFixture<ChildViewContainerComponent>;
  readonly component: ChapterAudioDialogComponent;
  readonly dialogRef: MatDialogRef<ChapterAudioDialogComponent>;

  constructor() {
    const config: MatDialogConfig<ChapterAudioDialogData> = {
      data: {
        projectId: 'project01',
        textsByBookId: TestEnvironment.textsByBookId,
        questionsSorted: this.questions
      }
    };

    when(mockedDialogService.confirm(anything(), anything())).thenResolve(true);
    when(mockedCsvService.parse(anything())).thenResolve([['1', '2', 'label']]);
    when(
      mockedFileService.uploadFile(
        FileType.Audio,
        'project01',
        TextAudioDoc.COLLECTION,
        anything(),
        anything(),
        anything(),
        anything(),
        true
      )
    ).thenResolve('audio url');

    this.fixture = TestBed.createComponent(ChildViewContainerComponent);
    this.dialogRef = TestBed.inject(MatDialog).open(ChapterAudioDialogComponent, config);
    this.component = this.dialogRef.componentInstance;
    this.fixture.detectChanges();
    tick();
  }

  clickElement(element: HTMLElement | DebugElement): void {
    if (element instanceof DebugElement) {
      element = element.nativeElement as HTMLElement;
    }
    element.click();
    this.fixture.detectChanges();
    flush();
    this.fixture.detectChanges();
  }

  get closeButton(): HTMLElement {
    return this.fetchElement('#audio-cancel-btn');
  }

  private get overlayContainerElement(): HTMLElement {
    return this.fixture.nativeElement.parentElement.querySelector('.cdk-overlay-container');
  }

  private fetchElement(query: string): HTMLElement {
    return this.overlayContainerElement.querySelector(query) as HTMLElement;
  }
}
