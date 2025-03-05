import { AfterViewInit, Component, DestroyRef, ElementRef, Inject, OnDestroy, ViewChild } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Canon } from '@sillsdev/scripture';
import { cloneDeep, reject } from 'lodash-es';
import { Chapter, TextInfo } from 'realtime-server//lib/esm/scriptureforge/models/text-info';
import { AudioTiming } from 'realtime-server/lib/esm/scriptureforge/models/audio-timing';
import { getTextAudioId } from 'realtime-server/lib/esm/scriptureforge/models/text-audio';
import { filter } from 'rxjs/operators';
import { CsvService } from 'xforge-common/csv-service.service';
import { DialogService } from 'xforge-common/dialog.service';
import { ExternalUrlService } from 'xforge-common/external-url.service';
import { FileService, formatFileSource } from 'xforge-common/file.service';
import { I18nKeyForComponent, I18nService } from 'xforge-common/i18n.service';
import { FileType } from 'xforge-common/models/file-offline-data';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { objectId } from 'xforge-common/utils';
import { QuestionDoc } from '../../core/models/question-doc';
import { TextAudioDoc } from '../../core/models/text-audio-doc';
import { TextsByBookId } from '../../core/models/texts-by-book-id';
import { SFProjectService } from '../../core/sf-project.service';
import { AudioAttachment } from '../checking/checking-audio-player/checking-audio-player.component';
import { SingleButtonAudioPlayerComponent } from '../checking/single-button-audio-player/single-button-audio-player.component';

const TIMING_FILE_EXTENSION_REGEX = /.(tsv|csv|txt)$/i;

export interface ChapterAudioDialogData {
  projectId: string;
  textsByBookId: TextsByBookId;
  questionsSorted: readonly QuestionDoc[];
  currentBook?: number;
  currentChapter?: number;
}

export interface ChapterAudioDialogResult {
  audioUrl: string;
  book: number;
  chapter: number;
  timingData: AudioTiming[];
}

@Component({
  selector: 'app-chapter-audio-dialog',
  templateUrl: './chapter-audio-dialog.component.html',
  styleUrls: ['./chapter-audio-dialog.component.scss']
})
export class ChapterAudioDialogComponent extends SubscriptionDisposable implements AfterViewInit, OnDestroy {
  @ViewChild('dropzone') dropzone?: ElementRef<HTMLDivElement>;
  @ViewChild('fileDropzone') fileDropzone?: ElementRef<HTMLInputElement>;
  @ViewChild('chapterAudio') chapterAudio?: SingleButtonAudioPlayerComponent;
  private audio?: AudioAttachment;
  private _book: number = this.books[0];
  private _chapter: number = 1;
  private textAudioQuery?: RealtimeQuery<TextAudioDoc>;
  private timing: AudioTiming[] = [];
  private timing_processed: AudioTiming[] = [];
  private _editState: boolean = false;
  private _selectionHasAudioAlready: boolean = false;
  private _audioLength: number = 0;
  private _audioBlob?: string;
  private _audioErrorKey?: I18nKeyForComponent<'chapter_audio_dialog'>;
  private _timingErrorKey?: I18nKeyForComponent<'chapter_audio_dialog'>;
  private _timingParseErrorKey?: I18nKeyForComponent<'chapter_audio_dialog'>;
  private _loadingAudio: boolean = false;

  constructor(
    private readonly destroyRef: DestroyRef,
    readonly i18n: I18nService,
    @Inject(MAT_DIALOG_DATA) public data: ChapterAudioDialogData,
    private readonly csvService: CsvService,
    private readonly dialogRef: MatDialogRef<ChapterAudioDialogComponent, ChapterAudioDialogResult | undefined>,
    private readonly fileService: FileService,
    private readonly dialogService: DialogService,
    private readonly onlineStatusService: OnlineStatusService,
    private readonly projectService: SFProjectService,
    protected readonly externalUrlService: ExternalUrlService
  ) {
    super();
    this.getStartingLocation();
  }

  get isAudioInvalid(): boolean {
    return this._audioErrorKey != null;
  }

  get audioFilename(): string {
    return this.audio?.fileName ?? '';
  }

  get audioBlob(): string | undefined {
    return this._audioBlob;
  }

  get selectionHasAudioAlready(): boolean {
    return this._selectionHasAudioAlready;
  }

  get book(): number {
    return this._book;
  }

  set book(book: number) {
    this._book = book;
    this.chapter = this.chapters[0];
    this.checkForPreexistingAudio();
  }

  get books(): number[] {
    return Object.values(this.data.textsByBookId)
      .map(t => t.bookNum)
      .sort((a, b) => a - b);
  }

  get chapter(): number {
    return this._chapter;
  }

  set chapter(chapter: number) {
    this._chapter = chapter;
    this.checkForPreexistingAudio();
  }

  get chapters(): number[] {
    if (this.book === 0 || this.book === undefined) {
      return [];
    }
    const bookAbbr: string = Canon.bookNumberToId(this.book);
    const text: TextInfo = this.data.textsByBookId[bookAbbr];
    return text.chapters.map(c => c.number);
  }

  get hasTimingBeenUploaded(): boolean {
    return this.timing_processed.length > 0;
  }

  get hasTimingDataError(): boolean {
    return this.timingErrorMessageKey !== '';
  }

  get hasAudioBeenUploaded(): boolean {
    return this.audio?.blob != null && this.audio?.fileName != null;
  }

  get hasAudioDataError(): boolean {
    return this.audioErrorMessageKey !== '';
  }

  get numberOfTimingSegments(): number {
    return this.timing_processed.length;
  }

  get inEditState(): boolean {
    return this._editState;
  }

  get isLoadingAudio(): boolean {
    return this._loadingAudio;
  }

  get timingErrorMessageKey(): string {
    return this._timingErrorKey ?? '';
  }

  get audioErrorMessageKey(): string {
    return this._audioErrorKey ?? '';
  }

  protected get isOnline(): boolean {
    return this.onlineStatusService.isOnline;
  }

  async audioUpdate(audio: AudioAttachment): Promise<void> {
    this._audioErrorKey = undefined;
    if (this.chapterAudio != null && this.chapterAudio.playing) {
      this.chapterAudio.stop();
    }
    this.audio = audio;
    if (audio.url != null) {
      if (audio.blob != null) {
        this._audioBlob = URL.createObjectURL(audio.blob);
      }
      await this.getDuration(audio.url).then(l => {
        this._audioLength = l;
        if (this.hasTimingBeenUploaded) {
          this.validateTimingEntries(this._audioLength);
        }
      });
    }
  }

  bookName(book: number): string {
    return this.i18n.localizeBook(book);
  }

  deleteAudioData(): void {
    this.audio = undefined;
    this.fileDropzone!.nativeElement.value = '';
  }

  deleteTimingData(): void {
    this.timing = [];
    this.timing_processed = [];
    this._timingErrorKey = undefined;
    this._timingParseErrorKey = undefined;

    if (this.fileDropzone) {
      this.fileDropzone.nativeElement.value = '';
    }
  }

  ngAfterViewInit(): void {
    this.dropzone?.nativeElement.addEventListener('dragover', _ => {
      this.dropzone?.nativeElement.classList.add('dragover');
    });
    this.dropzone?.nativeElement.addEventListener('dragleave', _ => {
      this.dropzone?.nativeElement.classList.remove('dragover');
    });
    this.dropzone?.nativeElement.addEventListener('drop', (e: DragEvent) => {
      this.dropzone?.nativeElement.classList.remove('dragover');
      if (e?.dataTransfer?.files == null) {
        return;
      }
      this.processUploadedFiles(e.dataTransfer.files);
    });
    this.projectService.queryAudioText(this.data.projectId, this.destroyRef).then(query => {
      this.textAudioQuery = query;
      this.populateExistingData();
    });
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
    if (this.textAudioQuery != null) {
      this.textAudioQuery.dispose();
    }
  }

  async prepareTimingFileUpload(file: File): Promise<void> {
    const result: string[][] = await this.csvService.parse(file);

    this.deleteTimingData();

    let timing: AudioTiming[] = [];
    if (result.length !== 0) {
      if (result[0].length === 6 && result[0][0] === 'Name') {
        // Adobe Audition style timing files have 6 columns and the first heading is "Name"
        timing = this.parseAdobeAuditionStyleTimingFile(result);
      } else if (result.some(row => row.length === 3)) {
        // Assume Audacity style timing files with 3 columns
        timing = this.parseAudacityStyleTimingFile(result);
      } else {
        this._timingParseErrorKey = 'unrecognized_timing_file_format';
      }
    }

    timing.sort((a, b) => a.from - b.from);
    this.timing = timing;
    this.validateTimingEntries(this._audioLength);
  }

  async save(): Promise<void> {
    const canSave: boolean =
      this.hasAudioBeenUploaded &&
      this.hasTimingBeenUploaded &&
      !this.hasTimingDataError &&
      this.book != null &&
      this.chapter != null;
    if (!this.hasTimingBeenUploaded) {
      this._timingErrorKey = 'no_timing_data_uploaded';
    }
    if (!this.hasAudioBeenUploaded) {
      this._audioErrorKey = 'no_audio_file_uploaded';
    }
    if (!canSave) {
      return;
    }

    // Adding chapter audio offline needs a bit more help to work; see SF-2213. Returning may seem unnecessary if we
    // also disable the Save button when offline, but returning could prevent a problem from the unlikely situation of
    // going offline just after clicking Save.
    if (!this.onlineStatusService.isOnline) return;

    this._loadingAudio = true;
    const audioUrl: string | undefined = await this.fileService.onlineUploadFileOrFail(
      FileType.Audio,
      this.data.projectId,
      TextAudioDoc.COLLECTION,
      objectId(),
      this.audio!.blob!,
      this.audio!.fileName!,
      true
    );

    // if the upload fails, we need to show an error and not close the dialog
    this._loadingAudio = false;
    if (audioUrl == null) {
      this.dialogService.message('chapter_audio_dialog.upload_failed');
      return;
    }

    this.dialogRef.close({
      timingData: this.timing_processed,
      book: this.book,
      chapter: this.chapter,
      audioUrl
    });
  }

  uploadedFiles(e: Event): void {
    const el = e.target as HTMLInputElement;
    if (el.files == null) {
      return;
    }
    this.processUploadedFiles(el.files);
  }

  private parseAdobeAuditionStyleTimingFile(data: string[][]): AudioTiming[] {
    // Remove the column headers
    data.shift();

    const timing: AudioTiming[] = [];

    for (const row of data) {
      if (row.length !== 6) {
        continue;
      }

      const [textRef, start, duration, timeFormat] = row;

      if (timeFormat !== 'decimal' && !timeFormat.endsWith('fps')) {
        // TODO: There is also a time format based on number of audio samples rather than time stamps directly.
        this._timingParseErrorKey = 'unrecognized_time_format';
        return [];
      }

      let from, to;

      // Decimal timing has the sub-second precision as part of the seconds i.e. 1:23.450 but FPS timing has it as a
      // distinct value in centiseconds i.e. 1:23:45
      if (timeFormat !== 'decimal') {
        from = this.parseTimeToSecondsWithCentiseconds(start);
        to = from + this.parseTimeToSecondsWithCentiseconds(duration);
      } else {
        from = this.parseTimeToSeconds(start);
        to = from + this.parseTimeToSeconds(duration);
      }

      // Allow point (zero duration) markers to be handled by populateToField
      if (from === to) {
        to = 0;
      }

      if (textRef === undefined || isNaN(from) || isNaN(to)) {
        continue;
      }

      timing.push({
        textRef,
        from,
        to
      } as AudioTiming);
    }

    return timing;
  }

  /**
   * Parse a timing file in the audacity style format.
   * https://manual.audacityteam.org/man/importing_and_exporting_labels.html
   */
  private parseAudacityStyleTimingFile(data: string[][]): AudioTiming[] {
    const timing: AudioTiming[] = [];

    for (const row of data) {
      if (row.length !== 3) {
        continue;
      }

      const from = this.parseTimeToSeconds(row[0]);
      const to = this.parseTimeToSeconds(row[1]);

      if (row[2] === undefined || isNaN(from) || isNaN(to)) {
        continue;
      }

      timing.push({
        textRef: row[2],
        from,
        to
      } as AudioTiming);
    }

    return timing;
  }

  private checkForPreexistingAudio(): void {
    const text: TextInfo = this.data.textsByBookId[Canon.bookNumberToId(this.book)];
    const textChapter: Chapter | undefined = text?.chapters.find(c => c.number === this.chapter);
    this._selectionHasAudioAlready = textChapter?.hasAudio ?? false;
  }

  private getDuration(url: string): Promise<number> {
    return new Promise(function (resolve) {
      const audio = new Audio();
      audio.addEventListener('loadedmetadata', function () {
        resolve(audio.duration);
      });
      audio.addEventListener('error', () => {
        reject(new Error(`Audio Load Failed Code ${audio.error?.code ?? 'Unknown'}: ${audio.error?.message}`));
      });
      audio.src = formatFileSource(FileType.Audio, url);
    });
  }

  private getStartingLocation(): void {
    if (this.data.currentBook != null && this.data.currentChapter != null) {
      this._book = this.data.currentBook;
      this._chapter = this.data.currentChapter;
      return;
    }

    const publishedQuestions: QuestionDoc[] = this.data.questionsSorted.filter(q => !q.data?.isArchived);
    for (const question of publishedQuestions) {
      const bookNum: number | undefined = question.data?.verseRef.bookNum;
      const chapterNum: number | undefined = question.data?.verseRef.chapterNum;

      if (bookNum == null || chapterNum == null) continue;

      const text: TextInfo = this.data.textsByBookId[Canon.bookNumberToId(bookNum)];
      const textChapter: Chapter | undefined = text?.chapters.find(c => c.number === chapterNum);
      if (textChapter !== undefined && !textChapter?.hasAudio) {
        this._book = bookNum;
        this._chapter = textChapter.number!;
        return;
      }
    }
  }

  /**
   * It supports multiple time formats: ss, mm:ss, hh:mm:ss, dd:hh:mm:ss
   */
  private parseTimeToSeconds(time: string): number {
    const a: string[] = time?.split(':');
    if (a?.length === 1) {
      return parseFloat(time);
    } else if (a?.length === 2) {
      return +a[0] * 60 + +a[1];
    } else if (a?.length === 3) {
      return +a[0] * 60 * 60 + +a[1] * 60 + +a[2];
    } else if (a?.length === 4) {
      return +a[0] * 60 * 60 * 24 + +a[1] * 60 * 60 + +a[2] * 60 + +a[3];
    }

    return NaN;
  }

  /**
   * Parse time strings which include a distinct centisecond value e.g. mm:ss:cs
   */
  private parseTimeToSecondsWithCentiseconds(time: string): number {
    const a: string[] = time?.split(':');

    const centiseconds = parseFloat(a.pop() as string) / 100;

    return this.parseTimeToSeconds(a.join(':')) + centiseconds;
  }

  private populateExistingData(): void {
    if (this.textAudioQuery == null || this.data.currentBook == null || this.data.currentChapter == null) {
      this.checkForPreexistingAudio();
      return;
    }
    this.subscribe(this.textAudioQuery.ready$.pipe(filter(ready => ready)), () => {
      const textAudioId: string = getTextAudioId(this.data.projectId, this.book, this.chapter);
      const doc = this.textAudioQuery?.docs.find(t => t.id === textAudioId)?.data;
      this.checkForPreexistingAudio();
      if (doc == null) {
        return;
      }
      this._editState = true;
      this.timing = this.timing_processed = doc.timings;
      this.fileService
        .findOrUpdateCache(FileType.Audio, TextAudioDoc.COLLECTION, textAudioId, doc.audioUrl)
        .then(data => {
          if (data == null) {
            return;
          }
          // Use book and chapter for the filename as the original filename is now unknown
          const audioAttachment: AudioAttachment = {
            url: data.onlineUrl,
            blob: data.blob,
            fileName: this.i18n.localizeBook(this.data.currentBook!) + ' ' + this.data.currentChapter,
            status: 'uploaded'
          };
          this.audioUpdate(audioAttachment);
        });
    });
  }

  /**
   * The TO field may contain data, it may be zero, or it needs to be determined
   * based on the length of the audio file
   */
  private populateToField(index: number, rows: AudioTiming[]): number {
    const row: AudioTiming = rows[index];
    if (row.to > 0) return row.to;

    if (index < rows.length - 1) {
      const nextRow: AudioTiming = rows[index + 1];
      return nextRow.from;
    } else {
      return this._audioLength;
    }
  }

  private processUploadedFiles(files: FileList): void {
    for (let index = 0; index < files.length; index++) {
      const file: File | null = files.item(index);
      if (file == null) {
        continue;
      }
      const isTimingFile: boolean = TIMING_FILE_EXTENSION_REGEX.test(file.name);
      if (isTimingFile) {
        this.prepareTimingFileUpload(file);
      } else {
        // if file is larger than 100MB, show an error
        if (file.size > 100_000_000) {
          this._audioErrorKey = 'audio_file_less_than_one_hundred_mb';
          this.deleteAudioData();
          continue;
        }
        const audioAttachment: AudioAttachment = {
          url: URL.createObjectURL(file),
          blob: file,
          fileName: file.name,
          status: 'uploaded'
        };

        this.audioUpdate(audioAttachment);
      }
    }
  }

  private validateTimingEntries(audioLength: number): void {
    if (this._timingParseErrorKey !== undefined) {
      this._timingErrorKey = this._timingParseErrorKey;
      return;
    }

    this._timingErrorKey = undefined;

    this.timing_processed = cloneDeep(this.timing);

    if (this.timing_processed.length === 0) {
      this._timingErrorKey = 'zero_segments';
    }

    if (audioLength === 0) return;

    for (const timing of this.timing_processed) {
      timing.to = this.populateToField(this.timing_processed.indexOf(timing), this.timing_processed);
    }

    // Check if one or more ending values end before their beginning values
    const firstValidation: AudioTiming[] = this.timing_processed.filter(t => t.from <= t.to);
    if (firstValidation.length !== this.timing_processed.length) {
      this._timingErrorKey = 'from_timing_past_to_timing';
    }

    // Check if one or more timing values extend past the end of the audio file
    const validated: AudioTiming[] = firstValidation.filter(t => t.from < audioLength && t.to <= audioLength);
    if (validated.length !== firstValidation.length) {
      this._timingErrorKey = 'timing_past_audio_length';
    }
  }
}
