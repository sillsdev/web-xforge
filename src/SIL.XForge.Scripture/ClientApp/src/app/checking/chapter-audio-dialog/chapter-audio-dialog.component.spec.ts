import { OverlayContainer } from '@angular/cdk/overlay';
import { DebugElement, NgModule, NgZone } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, flush } from '@angular/core/testing';
import { MatDialog, MatDialogConfig, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Canon } from '@sillsdev/scripture';
import { ngfModule } from 'angular-file';
import { Chapter, TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { QuestionDoc } from 'src/app/core/models/question-doc';
import { TextAudioDoc } from 'src/app/core/models/text-audio-doc';
import { TextsByBookId } from 'src/app/core/models/texts-by-book-id';
import { anything, mock, when } from 'ts-mockito';
import { CsvService } from 'xforge-common/csv-service.service';
import { DialogService } from 'xforge-common/dialog.service';
import { FileService } from 'xforge-common/file.service';
import { FileType } from 'xforge-common/models/file-offline-data';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import {
  ChildViewContainerComponent,
  TestTranslocoModule,
  configureTestingModule,
  getAudioBlob
} from 'xforge-common/test-utils';
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

  let overlayContainer: OverlayContainer;
  beforeEach(() => {
    overlayContainer = TestBed.inject(OverlayContainer);
    env = new TestEnvironment();
  });
  afterEach(() => {
    // Prevents 'Error: Test did not clean up its overlay container content.'
    overlayContainer.ngOnDestroy();
  });

  it('should upload audio and return timing data on save', fakeAsync(async () => {
    const promiseForResult: Promise<ChapterAudioDialogResult> = env.dialogRef.afterClosed().toPromise();
    await env.component.audioUpdate(env.audioFile);
    await env.component.prepareTimingFileUpload(anything());
    await env.component.save();
    await env.wait();

    const result: ChapterAudioDialogResult = await promiseForResult;

    expect(result.audioUrl).toEqual('audio url');
    expect(result.book).toEqual(env.component.book);
    expect(result.chapter).toEqual(env.component.chapter);
    expect(result.timingData.length).toEqual(2);
    for (let row of result.timingData) {
      expect(row.to).not.toEqual(0);
    }
    expect(env.component.errorMessage).toEqual('');
  }));

  it('should default selection to first chapter with question and no audio', fakeAsync(async () => {
    const chapterOfFirstQuestion: Chapter = TestEnvironment.textsByBookId[
      Canon.bookNumberToId(env.question1.data?.verseRef.bookNum!)
    ].chapters.find(c => c.number === env.question1.data?.verseRef.chapterNum)!;

    expect(!chapterOfFirstQuestion.hasAudio);
    expect(env.component.book).toEqual(env.question1.data?.verseRef.bookNum!);
    expect(env.component.chapter).toEqual(env.question1.data?.verseRef.chapterNum!);
  }));

  it('detects if selection has audio already', fakeAsync(async () => {
    const firstChapterWithAudio: Chapter = Object.entries(TestEnvironment.textsByBookId)
      .map(([, value]) => value.chapters)
      .flat(1)
      .find(c => c.hasAudio)!;
    const containingBook: TextInfo = Object.entries(TestEnvironment.textsByBookId).find(([, value]) =>
      value.chapters.includes(firstChapterWithAudio!)
    )?.[1]!;

    expect(env.component.chapter).not.toEqual(firstChapterWithAudio.number);
    expect(env.component.selectionHasAudioAlready).not.toBeTruthy();

    env.component.book = containingBook.bookNum;
    env.component.chapter = firstChapterWithAudio.number;

    expect(env.component.book).toEqual(containingBook.bookNum);
    expect(env.component.chapter).toEqual(firstChapterWithAudio.number);
    expect(env.component.selectionHasAudioAlready).toBeTruthy();
  }));

  it('populates books and chapters', fakeAsync(async () => {
    expect(env.component.books.length).toEqual(2);

    for (let i of Object.entries(TestEnvironment.textsByBookId)) {
      const bookNum = i[1].bookNum;
      const numChapters = i[1].chapters.length;
      env.component.book = bookNum;

      expect(env.component.chapters.length).toEqual(numChapters);
    }
  }));

  it('shows warning if zero timing entries are found', fakeAsync(async () => {
    when(mockedCsvService.parse(anything())).thenResolve([
      ['error here', '0', 'v1'],
      ['1', 'error there', 'v2'],
      ['1.1', '0']
    ]);

    await env.component.audioUpdate(env.audioFile);
    await env.component.prepareTimingFileUpload(anything());

    expect(env.component.errorMessage).toContain('Zero segments found');
  }));

  it('shows warning if From field goes beyond audio length', fakeAsync(async () => {
    when(mockedCsvService.parse(anything())).thenResolve([
      ['0.01', '0', 'v1'],
      ['1', '0', 'v2'],
      ['5.2', '0', 'v3']
    ]);

    await env.component.audioUpdate(env.audioFile);
    await env.component.prepareTimingFileUpload(anything());
    await env.wait();

    expect(env.component.errorMessage).toContain('One or more timing values extend past the end of the audio file');
  }));

  it('can also parse mm:ss', fakeAsync(async () => {
    when(mockedCsvService.parse(anything())).thenResolve([
      ['00:00', '0', 'v1'],
      ['00:01', '0', 'v2']
    ]);

    await env.component.audioUpdate(env.audioFile);
    await env.component.prepareTimingFileUpload(anything());

    expect(env.component.errorMessage).toEqual('');
  }));

  it('can also parse hh:mm:ss', fakeAsync(async () => {
    when(mockedCsvService.parse(anything())).thenResolve([
      ['00:00:00', '0', 'v1'],
      ['00:00:01', '0', 'v2']
    ]);

    await env.component.audioUpdate(env.audioFile);
    await env.component.prepareTimingFileUpload(anything());

    expect(env.component.errorMessage).toEqual('');
  }));

  it('will not save or upload if there is no audio', fakeAsync(async () => {
    await env.component.prepareTimingFileUpload(anything());
    await env.component.save();

    expect(env.numberOfTimesDialogClosed).toEqual(0);
  }));

  it('will not save or upload if there is no timing data', fakeAsync(async () => {
    await env.component.audioUpdate(env.audioFile);
    await env.component.save();

    expect(env.numberOfTimesDialogClosed).toEqual(0);
  }));
});

@NgModule({
  imports: [MatDialogModule, NoopAnimationsModule, UICommonModule, ngfModule, CheckingModule, TestTranslocoModule]
})
class DialogTestModule {}

class TestEnvironment {
  static genesisText: TextInfo = {
    bookNum: 1,
    hasSource: false,
    chapters: [
      { number: 2, lastVerse: 50, isValid: true, permissions: {}, hasAudio: true },
      { number: 3, lastVerse: 33, isValid: true, permissions: {} }
    ],
    permissions: {}
  };
  static matthewText: TextInfo = {
    bookNum: 40,
    hasSource: false,
    chapters: [
      { number: 1, lastVerse: 25, isValid: true, permissions: {} },
      { number: 3, lastVerse: 17, isValid: true, permissions: {} }
    ],
    permissions: {}
  };
  static textsByBookId: TextsByBookId = {
    [Canon.bookNumberToId(1)]: TestEnvironment.genesisText,
    [Canon.bookNumberToId(40)]: TestEnvironment.matthewText
  };

  readonly question1: QuestionDoc = {
    data: { text: 'Genesis 3:1 question', verseRef: { bookNum: 1, chapterNum: 3, verseNum: 1 } }
  } as QuestionDoc;
  readonly question2: QuestionDoc = {
    data: { text: 'Matthew 1:1 question', verseRef: { bookNum: 40, chapterNum: 1, verseNum: 1 } }
  } as QuestionDoc;
  readonly questions: QuestionDoc[] = [this.question1, this.question2];

  readonly fixture: ComponentFixture<ChildViewContainerComponent>;
  readonly ngZone: NgZone = TestBed.inject(NgZone);
  readonly component: ChapterAudioDialogComponent;
  readonly dialogRef: MatDialogRef<ChapterAudioDialogComponent>;
  readonly audioFile: AudioAttachment;
  private numTimesClosedFired: number;

  constructor() {
    const config: MatDialogConfig<ChapterAudioDialogData> = {
      data: {
        projectId: 'project01',
        textsByBookId: TestEnvironment.textsByBookId,
        questionsSorted: this.questions
      }
    };

    when(mockedDialogService.confirm(anything(), anything())).thenResolve(true);
    when(mockedCsvService.parse(anything())).thenResolve([
      ['0.1', '0', 'v1'],
      ['1', '0', 'v2']
    ]);
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
    this.audioFile = {
      status: 'uploaded',
      blob: getAudioBlob(),
      fileName: 'test-audio-player.webm',
      url: URL.createObjectURL(new File([getAudioBlob()], 'test.wav'))
    };

    this.fixture = TestBed.createComponent(ChildViewContainerComponent);
    this.dialogRef = TestBed.inject(MatDialog).open(ChapterAudioDialogComponent, config);
    this.component = this.dialogRef.componentInstance;

    this.numTimesClosedFired = 0;
    this.dialogRef.afterClosed().subscribe(() => {
      this.numTimesClosedFired++;
    });
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

  get numberOfTimesDialogClosed(): number {
    return this.numTimesClosedFired;
  }

  async wait(ms: number = 200): Promise<void> {
    await new Promise(resolve => this.ngZone.runOutsideAngular(() => setTimeout(resolve, ms)));
    this.fixture.detectChanges();
  }
}
