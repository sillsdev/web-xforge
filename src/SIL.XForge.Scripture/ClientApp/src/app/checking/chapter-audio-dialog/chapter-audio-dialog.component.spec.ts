import { OverlayContainer } from '@angular/cdk/overlay';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { DebugElement, NgModule, NgZone } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { MatDialog, MatDialogConfig, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Canon } from '@sillsdev/scripture';
import { ngfModule } from 'angular-file';
import { getTextAudioId, TextAudio } from 'realtime-server/lib/esm/scriptureforge/models/text-audio';
import { createTestTextAudio } from 'realtime-server/lib/esm/scriptureforge/models/text-audio-test-data';
import { Chapter, TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { firstValueFrom } from 'rxjs';
import { anything, mock, when } from 'ts-mockito';
import { CsvService } from 'xforge-common/csv-service.service';
import { DialogService } from 'xforge-common/dialog.service';
import { FileService } from 'xforge-common/file.service';
import { FileOfflineData, FileType } from 'xforge-common/models/file-offline-data';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import {
  ChildViewContainerComponent,
  configureTestingModule,
  getAudioBlob,
  getShortAudioBlob,
  TestTranslocoModule
} from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { QuestionDoc } from '../../core/models/question-doc';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { TextAudioDoc } from '../../core/models/text-audio-doc';
import { TextsByBookId } from '../../core/models/texts-by-book-id';
import { SFProjectService } from '../../core/sf-project.service';
import { CheckingModule } from '../checking.module';
import { AudioAttachment } from '../checking/checking-audio-player/checking-audio-player.component';
import {
  ChapterAudioDialogComponent,
  ChapterAudioDialogData,
  ChapterAudioDialogResult
} from './chapter-audio-dialog.component';

const mockedDialogService = mock(DialogService);
const mockedCsvService = mock(CsvService);
const mockedFileService = mock(FileService);
const mockedSFProjectService = mock(SFProjectService);

describe('ChapterAudioDialogComponent', () => {
  configureTestingModule(() => ({
    imports: [DialogTestModule, TestOnlineStatusModule.forRoot(), TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)],
    providers: [
      { provide: DialogService, useMock: mockedDialogService },
      { provide: CsvService, useMock: mockedCsvService },
      { provide: FileService, useMock: mockedFileService },
      { provide: SFProjectService, useMock: mockedSFProjectService },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService }
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
    const promiseForResult: Promise<ChapterAudioDialogResult> = firstValueFrom(env.dialogRef.afterClosed());
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
    expect(env.component.timingErrorMessageKey).toEqual('');
  }));

  it('should default selection to first chapter with question and no audio', fakeAsync(() => {
    const chapterOfFirstQuestion: Chapter = TestEnvironment.textsByBookId[
      Canon.bookNumberToId(env.question1.data?.verseRef.bookNum!)
    ].chapters.find(c => c.number === env.question1.data?.verseRef.chapterNum)!;

    expect(!chapterOfFirstQuestion.hasAudio);
    expect(env.component.book).toEqual(env.question1.data?.verseRef.bookNum!);
    expect(env.component.chapter).toEqual(env.question1.data?.verseRef.chapterNum!);
  }));

  it('defaults selection to provided book and chapter', fakeAsync(() => {
    const config: MatDialogConfig<ChapterAudioDialogData> = {
      data: {
        projectId: 'project01',
        textsByBookId: TestEnvironment.textsByBookId,
        questionsSorted: env.questions,
        currentBook: 40,
        currentChapter: 1
      }
    };

    env = new TestEnvironment(config);

    expect(env.component.book).toEqual(40);
    expect(env.component.chapter).toEqual(1);

    flush();
  }));

  it('detects if selection has audio already', fakeAsync(() => {
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

  it('detects if first chapter has audio already', fakeAsync(() => {
    // Get the first chapter with audio
    const firstChapterWithAudio: Chapter = Object.entries(TestEnvironment.textsByBookId)
      .map(([, value]) => value.chapters)
      .flat(1)
      .find(c => c.hasAudio)!;
    const containingBook: TextInfo = Object.entries(TestEnvironment.textsByBookId).find(([, value]) =>
      value.chapters.includes(firstChapterWithAudio!)
    )?.[1]!;

    // Configure the dialog to show that chapter
    const config: MatDialogConfig<ChapterAudioDialogData> = {
      data: {
        projectId: 'project01',
        textsByBookId: TestEnvironment.textsByBookId,
        questionsSorted: env.questions,
        currentBook: containingBook.bookNum,
        currentChapter: firstChapterWithAudio.number
      }
    };

    env = new TestEnvironment(config);
    tick();

    // Ensure that the UI shows that hte chapter has audio
    expect(env.component.book).toEqual(containingBook.bookNum);
    expect(env.component.chapter).toEqual(firstChapterWithAudio.number);
    expect(env.component.selectionHasAudioAlready).toBeTruthy();

    flush();
  }));

  it('populates books and chapters', fakeAsync(() => {
    expect(env.component.books.length).toEqual(2);

    for (let i of Object.entries(TestEnvironment.textsByBookId)) {
      const bookNum = i[1].bookNum;
      const numChapters = i[1].chapters.length;
      env.component.book = bookNum;

      expect(env.component.chapters.length).toEqual(numChapters);
    }
  }));

  it('shows warning if zero valid timing entries are found', fakeAsync(async () => {
    when(mockedCsvService.parse(anything())).thenResolve([
      ['error here', '0', 'v1'],
      ['1', 'error there', 'v2'],
      ['1.1', '0']
    ]);

    await env.component.audioUpdate(env.audioFile);
    await env.component.prepareTimingFileUpload(anything());
    await env.wait();

    expect(env.component.timingErrorMessageKey).toContain('zero_segments');
    expect(env.wrapperTiming.classList.contains('invalid')).toBe(true);
  }));

  it('shows warning if zero timing entries are found', fakeAsync(async () => {
    when(mockedCsvService.parse(anything())).thenResolve([]);

    await env.component.audioUpdate(env.audioFile);
    await env.component.prepareTimingFileUpload(anything());
    await env.wait();

    expect(env.component.timingErrorMessageKey).toContain('zero_segments');
    expect(env.wrapperTiming.classList.contains('invalid')).toBe(true);
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

    expect(env.component.timingErrorMessageKey).toContain('timing_past_audio_length');
    expect(env.wrapperTiming.innerText).not.toContain('segments found');
    expect(env.wrapperTiming.classList.contains('invalid')).toBe(true);
  }));

  it('shows warning if timing data file format is not recognized', fakeAsync(async () => {
    when(mockedCsvService.parse(anything())).thenResolve([
      ['Range', 'Name'],
      ['100:101', 'v1']
    ]);

    await env.component.audioUpdate(env.audioFile);
    await env.component.prepareTimingFileUpload(anything());
    await env.wait();

    expect(env.component.timingErrorMessageKey).toContain('unrecognized_timing_file_format');
    expect(env.wrapperTiming.classList.contains('invalid')).toBe(true);
  }));

  it('shows warning when parsing adobe audition timing data with unknown time format', fakeAsync(async () => {
    when(mockedCsvService.parse(anything())).thenResolve([
      ['Name', 'Start', 'Duration', 'Time Format', 'Type', 'Description'],
      ['v1', '0:02.179', '0:00.000', 'unknown', 'Cue', '']
    ]);

    await env.component.audioUpdate(env.audioFile);
    await env.component.prepareTimingFileUpload(anything());
    await env.wait();

    expect(env.component.timingErrorMessageKey).toContain('unrecognized_time_format');
    expect(env.wrapperTiming.classList.contains('invalid')).toBe(true);
  }));

  it('shows warning when parsing adobe audition timing data with no entries', fakeAsync(async () => {
    when(mockedCsvService.parse(anything())).thenResolve([
      ['Name', 'Start', 'Duration', 'Time Format', 'Type', 'Description']
    ]);

    await env.component.audioUpdate(env.audioFile);
    await env.component.prepareTimingFileUpload(anything());
    await env.wait();

    expect(env.component.timingErrorMessageKey).toContain('zero_segments');
    expect(env.wrapperTiming.classList.contains('invalid')).toBe(true);
  }));

  it('shows warning when parsing adobe audition timing data with no valid entries', fakeAsync(async () => {
    when(mockedCsvService.parse(anything())).thenResolve([
      ['Name', 'Start', 'Duration', 'Time Format', 'Type', 'Description'],
      ['Error Here']
    ]);

    await env.component.audioUpdate(env.audioFile);
    await env.component.prepareTimingFileUpload(anything());
    await env.wait();

    expect(env.component.timingErrorMessageKey).toContain('zero_segments');
    expect(env.wrapperTiming.classList.contains('invalid')).toBe(true);
  }));

  it('shows warning when parsing adobe audition timing with invalid times', fakeAsync(async () => {
    when(mockedCsvService.parse(anything())).thenResolve([
      ['Name', 'Start', 'Duration', 'Time Format', 'Type', 'Description'],
      ['v1', '1:2:3:4:5', '1:2:3:4:5', 'decimal', 'Cue', '']
    ]);

    await env.component.audioUpdate(env.audioFile);
    await env.component.prepareTimingFileUpload(anything());
    await env.wait();

    expect(env.component.timingErrorMessageKey).toContain('zero_segments');
    expect(env.wrapperTiming.classList.contains('invalid')).toBe(true);
  }));

  it('can also parse audacity style timing data with mm:ss', fakeAsync(() => {
    when(mockedCsvService.parse(anything())).thenResolve([
      ['00:00', '0', 'v1'],
      ['00:01', '0', 'v2']
    ]);

    env.component.audioUpdate(env.audioFile);
    env.component.prepareTimingFileUpload(anything());

    expect(env.component.timingErrorMessageKey).toEqual('');
  }));

  it('can also parse audacity style timing data with hh:mm:ss', fakeAsync(() => {
    when(mockedCsvService.parse(anything())).thenResolve([
      ['00:00:00', '0', 'v1'],
      ['00:00:01', '0', 'v2']
    ]);

    env.component.audioUpdate(env.audioFile);
    env.component.prepareTimingFileUpload(anything());

    expect(env.component.timingErrorMessageKey).toEqual('');
  }));

  it('can parse audacity style timing data with headings', fakeAsync(async () => {
    when(mockedCsvService.parse(anything())).thenResolve([
      ['\\id ROM'],
      ['\\c 1'],
      ['\\level verse'],
      ['0.0', '0.5', '1'],
      ['0.5', '1.0', '2']
    ]);

    await env.component.audioUpdate(env.audioFile);
    await env.component.prepareTimingFileUpload(anything());

    expect(env.component.timingErrorMessageKey).toEqual('');
  }));

  it('can also parse adobe audition style timing data with decimal time format', fakeAsync(async () => {
    when(mockedCsvService.parse(anything())).thenResolve([
      ['Name', 'Start', 'Duration', 'Time Format', 'Type', 'Description'],
      ['s', '0:01.01', '0:00.000', 'decimal', 'Cue', '']
    ]);

    await env.component.audioUpdate(env.audioFile);
    await env.component.prepareTimingFileUpload(anything());

    expect(env.component.timingErrorMessageKey).toEqual('');
  }));

  it('can also parse adobe audition style timing data with fps time format', fakeAsync(async () => {
    when(mockedCsvService.parse(anything())).thenResolve([
      ['Name', 'Start', 'Duration', 'Time Format', 'Type', 'Description'],
      ['s', '00:00:01:01', '0:00.000', '75 fps', 'Cue', '']
    ]);

    await env.component.audioUpdate(env.audioFile);
    await env.component.prepareTimingFileUpload(anything());

    expect(env.component.timingErrorMessageKey).toEqual('');
  }));

  it('can correctly handle adobe audition style timing data with point markers', fakeAsync(async () => {
    when(mockedCsvService.parse(anything())).thenResolve([
      ['Name', 'Start', 'Duration', 'Time Format', 'Type', 'Description'],
      ['s', '0:01', '0:00.000', 'decimal', 'Cue', ''],
      ['s', '0:01.1', '0:00.000', 'decimal', 'Cue', '']
    ]);

    const promiseForResult: Promise<ChapterAudioDialogResult> = firstValueFrom(env.dialogRef.afterClosed());
    await env.component.audioUpdate(env.audioFile);
    await env.component.prepareTimingFileUpload(anything());
    await env.component.save();
    await env.wait();
    const result: ChapterAudioDialogResult = await promiseForResult;

    expect(env.component.timingErrorMessageKey).toEqual('');
    // The "from" value of the next entry
    expect(result.timingData[0].to).toEqual(1.1);
    // The end of the audio file
    expect(result.timingData[1].to).toEqual(1.296);
  }));

  it('will not save or upload if there is no audio', fakeAsync(() => {
    env.component.prepareTimingFileUpload(anything());
    env.component.save();
    env.fixture.detectChanges();

    expect(env.numberOfTimesDialogClosed).toEqual(0);
    expect(env.wrapperAudio.classList.contains('invalid')).toBe(true);
  }));

  it('will not save or upload if there is no timing data', fakeAsync(() => {
    env.component.audioUpdate(env.audioFile);
    env.component.save();
    env.fixture.detectChanges();

    expect(env.numberOfTimesDialogClosed).toEqual(0);
    expect(env.wrapperTiming.classList.contains('invalid')).toBe(true);
  }));

  it('can drag and drop to initiate an upload', fakeAsync(() => {
    env.component.prepareTimingFileUpload(anything());
    env.fixture.detectChanges();
    const dataTransfer = new DataTransfer();
    for (const file of TestEnvironment.uploadFiles) {
      dataTransfer.items.add(file);
    }
    const dropEvent = new DragEvent('drop', { dataTransfer });
    env.dropzoneElement.dispatchEvent(dropEvent);
    tick();

    expect(env.wrapperAudio.classList.contains('valid')).toBe(true);
    expect(env.wrapperTiming.classList.contains('valid')).toBe(true);
  }));

  it('can browse to upload files', fakeAsync(() => {
    env.component.prepareTimingFileUpload(anything());
    env.fixture.detectChanges();
    const dataTransfer = new DataTransfer();
    for (const file of TestEnvironment.uploadFiles) {
      dataTransfer.items.add(file);
    }
    const event = new Event('change');
    env.fileUploadElement.files = dataTransfer.files;
    env.fileUploadElement.dispatchEvent(event);
    tick();

    expect(env.wrapperAudio.classList.contains('valid')).toBe(true);
    expect(env.wrapperTiming.classList.contains('valid')).toBe(true);
  }));

  // TODO: Enable once we have audio stub merged in
  xit('stop playing audio if a new audio file is uploaded', fakeAsync(() => {
    env.component.prepareTimingFileUpload(anything());
    env.fixture.detectChanges();
    const dataTransfer = new DataTransfer();
    for (const file of TestEnvironment.uploadFiles) {
      dataTransfer.items.add(file);
    }
    const event = new Event('change');
    env.fileUploadElement.files = dataTransfer.files;
    env.fileUploadElement.dispatchEvent(event);
    tick();

    expect(env.wrapperAudio.classList.contains('valid')).toBe(true);
    env.playAudio();
    expect(env.component.chapterAudio!.playing).toBe(true);

    // Trigger another upload event
    env.fileUploadElement.dispatchEvent(event);
    tick();

    expect(env.wrapperAudio.classList.contains('valid')).toBe(true);
    expect(env.component.chapterAudio!.playing).toBe(false);
  }));

  it('will maintain timing data parse errors across audio file uploads', fakeAsync(async () => {
    when(mockedCsvService.parse(anything())).thenResolve([
      ['Name', 'Start', 'Duration', 'Time Format', 'Type', 'Description'],
      ['s', '00:00:01:01', '0:00.000', 'parse error here', 'Cue', '']
    ]);

    await env.component.audioUpdate(env.audioFile);
    await env.component.prepareTimingFileUpload(anything());
    await env.wait();

    expect(env.component.timingErrorMessageKey).toContain('unrecognized_time_format');
    expect(env.wrapperTiming.classList.contains('invalid')).toBe(true);

    await env.component.audioUpdate(env.audioFile);

    expect(env.component.timingErrorMessageKey).toContain('unrecognized_time_format');
    expect(env.wrapperTiming.classList.contains('invalid')).toBe(true);
  }));

  it('will not maintain timing data length errors across audio file uploads if no longer valid', fakeAsync(async () => {
    when(mockedCsvService.parse(anything())).thenResolve([
      ['Name', 'Start', 'Duration', 'Time Format', 'Type', 'Description'],
      ['s', '00:00:01', '00:00:00.001', 'decimal', 'Cue', '']
    ]);

    await env.component.audioUpdate(env.shortAudioFile);
    await env.component.prepareTimingFileUpload(anything());
    await env.wait();

    expect(env.component.timingErrorMessageKey).toContain('timing_past_audio_length');
    expect(env.wrapperTiming.classList.contains('invalid')).toBe(true);

    await env.component.audioUpdate(env.audioFile);

    expect(env.component.timingErrorMessageKey).toEqual('');
    expect(env.wrapperTiming.classList.contains('valid')).toBe(true);
  }));

  it('will not try to save dialog if offline', fakeAsync(() => {
    env.onlineStatus = false;
    env.component.audioUpdate(env.audioFile);
    tick();
    env.component.prepareTimingFileUpload(anything());
    tick();

    // SUT
    env.component.save();
    tick();
    env.fixture.detectChanges();
    flush();
    expect(env.numberOfTimesDialogClosed)
      .withContext('saving should not occur and close dialog while offline')
      .toEqual(0);
  }));

  it('will try to save and close dialog if online', fakeAsync(() => {
    env.onlineStatus = true;
    env.component.audioUpdate(env.audioFile);
    tick();
    env.component.prepareTimingFileUpload(anything());
    tick();

    // SUT
    env.component.save();
    tick();
    env.fixture.detectChanges();
    flush();
    expect(env.numberOfTimesDialogClosed).withContext('saving should occur and close dialog when online').toEqual(1);
  }));

  it('disables save button if offline, shows message', fakeAsync(async () => {
    const config: MatDialogConfig<ChapterAudioDialogData> = {
      data: {
        projectId: 'project01',
        textsByBookId: TestEnvironment.textsByBookId,
        questionsSorted: env.questions
      }
    };

    env = new TestEnvironment(config);

    // SUT 1
    expect(env.saveButton.disabled).withContext('save button should not be disabled; not offline').toBe(false);
    expect(env.offlineError).withContext('bottom offline error should not be showing if online').toBeNull();
    env.onlineStatus = false;

    // SUT 2
    expect(env.saveButton.disabled).withContext('save button should be disabled when offline').toBe(true);
    expect(env.offlineError.textContent)
      .withContext('should show message that user needs to connect to continue')
      .toContain('internet');
  }));

  it('populate with existing data if available', async () => {
    const expectedBook = 1;
    const expectedChapter = 3;
    const config: MatDialogConfig<ChapterAudioDialogData> = {
      data: {
        projectId: 'project02',
        textsByBookId: TestEnvironment.textsByBookId,
        questionsSorted: env.questions,
        currentBook: expectedBook,
        currentChapter: expectedChapter
      }
    };
    let result: ChapterAudioDialogResult;

    // Close the dialog opened from beforeEach
    env.closeDialog();

    env = new TestEnvironment(config);
    await env.wait();

    env.dialogRef.afterClosed().subscribe((_result: ChapterAudioDialogResult) => {
      result = _result;
    });

    expect(env.component.book).toEqual(expectedBook);
    expect(env.component.chapter).toEqual(expectedChapter);
    expect(env.component.audioFilename).toEqual('Genesis 3');
    expect(env.bookSelect.classList.contains('mat-mdc-select-disabled')).toBe(true);
    expect(env.chapterSelect.classList.contains('mat-mdc-select-disabled')).toBe(true);
    expect(env.wrapperAudio.classList.contains('valid')).toBe(true);
    expect(env.wrapperTiming.classList.contains('valid')).toBe(true);

    await env.component.audioUpdate(env.audioFile);
    await env.component.prepareTimingFileUpload(anything());
    await env.component.save();
    await env.wait();

    expect(result!.timingData.length).toBeGreaterThan(0);
    expect(result!.timingData.every(t => t.to > 0)).toBe(true);
  });
});

@NgModule({
  imports: [MatDialogModule, NoopAnimationsModule, UICommonModule, ngfModule, CheckingModule, TestTranslocoModule],
  providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
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
  static uploadFiles: File[] = [new File([], 'audio.mp3'), new File([], 'timing.csv')];

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
  readonly shortAudioFile: AudioAttachment;
  readonly testOnlineStatusService: TestOnlineStatusService = TestBed.inject(
    OnlineStatusService
  ) as TestOnlineStatusService;
  private numTimesClosedFired: number;
  private readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

  constructor(config?: MatDialogConfig<ChapterAudioDialogData>) {
    if (!config) {
      config = {
        data: {
          projectId: 'project01',
          textsByBookId: TestEnvironment.textsByBookId,
          questionsSorted: this.questions
        }
      };
    }

    if (config.data?.currentBook) {
      this.addTextAudioData(config.data);
    }

    when(mockedCsvService.parse(anything())).thenResolve([
      ['0.1', '0', 'v1'],
      ['1', '0', 'v2']
    ]);
    when(
      mockedFileService.onlineUploadFileOrFail(
        FileType.Audio,
        anything(),
        TextAudioDoc.COLLECTION,
        anything(),
        anything(),
        anything(),
        true
      )
    ).thenResolve('audio url');
    when(mockedSFProjectService.queryAudioText(anything())).thenReturn(
      this.realtimeService.subscribeQuery(TextAudioDoc.COLLECTION, {})
    );

    this.audioFile = {
      status: 'uploaded',
      blob: getAudioBlob(),
      fileName: 'test-audio-player.webm',
      url: URL.createObjectURL(new File([getAudioBlob()], 'test.wav'))
    };

    when(
      mockedFileService.findOrUpdateCache(FileType.Audio, TextAudioDoc.COLLECTION, anything(), anything())
    ).thenResolve({
      id: 'audio01',
      dataCollection: TextAudioDoc.COLLECTION,
      filename: this.audioFile.fileName,
      blob: this.audioFile.blob,
      url: this.audioFile.url,
      onlineUrl: this.audioFile.fileName
    } as FileOfflineData);

    this.shortAudioFile = {
      status: 'uploaded',
      blob: getShortAudioBlob(),
      fileName: 'short-test-audio-player.webm',
      url: URL.createObjectURL(new File([getShortAudioBlob()], 'short-test.wav'))
    };

    this.fixture = TestBed.createComponent(ChildViewContainerComponent);
    this.dialogRef = TestBed.inject(MatDialog).open(ChapterAudioDialogComponent, config);
    this.component = this.dialogRef.componentInstance;

    this.numTimesClosedFired = 0;
    this.dialogRef.afterClosed().subscribe(() => {
      this.numTimesClosedFired++;
    });
  }

  get bookSelect(): HTMLInputElement {
    return this.overlayContainerElement.querySelector('.book-select-menu') as HTMLInputElement;
  }

  get chapterSelect(): HTMLInputElement {
    return this.overlayContainerElement.querySelector('.chapter-select-menu') as HTMLInputElement;
  }

  set onlineStatus(isOnline: boolean) {
    this.testOnlineStatusService.setIsOnline(isOnline);
    tick();
    this.fixture.detectChanges();
  }

  get fileUploadElement(): HTMLInputElement {
    return this.dropzoneElement.querySelector('input[type=file]') as HTMLInputElement;
  }

  get dropzoneElement(): HTMLElement {
    return this.overlayContainerElement.querySelector('.dropzone') as HTMLElement;
  }

  get numberOfTimesDialogClosed(): number {
    return this.numTimesClosedFired;
  }

  get wrapperAudio(): HTMLElement {
    return this.overlayContainerElement.querySelector('.wrapper-audio') as HTMLElement;
  }

  get saveButton(): HTMLButtonElement {
    return this.fetchElement('#audio-save-btn') as HTMLButtonElement;
  }

  get offlineError(): HTMLElement {
    return this.fetchElement('#offline-error');
  }

  get wrapperTiming(): HTMLElement {
    return this.overlayContainerElement.querySelector('.wrapper-timing') as HTMLElement;
  }

  private get overlayContainerElement(): HTMLElement {
    return this.fixture.nativeElement.parentElement.querySelector('.cdk-overlay-container');
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

  closeDialog(): void {
    this.dialogRef.close();
  }

  fetchElement(query: string): HTMLElement {
    return this.overlayContainerElement.querySelector(query) as HTMLElement;
  }

  addTextAudioData(data: ChapterAudioDialogData): void {
    const dataId = getTextAudioId(data.projectId, data.currentBook ?? 1, data.currentChapter ?? 1);
    this.realtimeService.addSnapshot<TextAudio>(TextAudioDoc.COLLECTION, {
      id: dataId,
      data: createTestTextAudio({
        dataId,
        projectRef: data.projectId,
        timings: [{ textRef: 'v1', from: 0, to: 1 }]
      })
    });
  }

  playAudio(): void {
    this.component.chapterAudio?.play();
    this.fixture.detectChanges();
  }

  async wait(ms: number = 200): Promise<void> {
    await new Promise(resolve => this.ngZone.runOutsideAngular(() => setTimeout(resolve, ms)));
    this.fixture.detectChanges();
  }
}
