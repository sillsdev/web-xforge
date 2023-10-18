import { AfterViewInit, Component, ElementRef, Inject, ViewChild } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Canon } from '@sillsdev/scripture';
import { reject } from 'lodash-es';
import { Chapter, TextInfo } from 'realtime-server//lib/esm/scriptureforge/models/text-info';
import { AudioTiming } from 'realtime-server/lib/esm/scriptureforge/models/audio-timing';
import { getTextDocId } from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import { QuestionDoc } from 'src/app/core/models/question-doc';
import { TextAudioDoc } from 'src/app/core/models/text-audio-doc';
import { CsvService } from 'xforge-common/csv-service.service';
import { DialogService } from 'xforge-common/dialog.service';
import { FileService } from 'xforge-common/file.service';
import { I18nKey, I18nService } from 'xforge-common/i18n.service';
import { FileType } from 'xforge-common/models/file-offline-data';
import { objectId } from 'xforge-common/utils';
import { TextsByBookId } from '../../core/models/texts-by-book-id';
import { AudioAttachment } from '../checking/checking-audio-recorder/checking-audio-recorder.component';
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
export class ChapterAudioDialogComponent implements AfterViewInit {
  @ViewChild('dropzone') dropzone?: ElementRef<HTMLDivElement>;
  @ViewChild('fileDropzone') fileDropzone?: ElementRef<HTMLInputElement>;
  @ViewChild('chapterAudio') chapterAudio?: SingleButtonAudioPlayerComponent;
  private audio?: AudioAttachment;
  private _book: number = this.books[0];
  private _chapter: number = 1;
  private timing: AudioTiming[] = [];
  private _selectionHasAudioAlready: boolean = false;
  private _audioLength: number = 0;
  private _audioBlob?: string;
  private _audioErrorText?: I18nKey;
  private _timingErrorText?: I18nKey;
  private _loadingAudio: boolean = false;

  constructor(
    readonly i18n: I18nService,
    @Inject(MAT_DIALOG_DATA) public data: ChapterAudioDialogData,
    private readonly csvService: CsvService,
    private readonly dialogRef: MatDialogRef<ChapterAudioDialogComponent, ChapterAudioDialogResult | undefined>,
    private readonly fileService: FileService,
    private readonly dialogService: DialogService
  ) {
    this.getStartingLocation();
    this.checkForPreexistingAudio();
  }

  get audioErrorMessage(): string {
    return this._audioErrorText ?? '';
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
    return this.timing.length > 0;
  }

  get hasAudioBeenUploaded(): boolean {
    return this.audio?.blob != null && this.audio?.fileName != null;
  }

  get numberOfTimingSegments(): number {
    return this.timing.length;
  }

  get isLoadingAudio(): boolean {
    return this._loadingAudio;
  }

  get timingErrorMessage(): string {
    return this._timingErrorText ?? '';
  }

  async audioUpdate(audio: AudioAttachment): Promise<void> {
    this._audioErrorText = undefined;
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
          this.validateTimingEntries(this.timing, this._audioLength);
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
    this._timingErrorText = undefined;
    this.fileDropzone!.nativeElement.value = '';
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
  }

  async prepareTimingFileUpload(file: File): Promise<void> {
    // TODO: Add support for Adobe Audition marker exports
    const result: string[][] = await this.csvService.parse(file);
    const timing: AudioTiming[] = [];
    for (const [_, row] of result.entries()) {
      const textRef: string = row[2];
      const from: number = this.parseTimeToSeconds(row[0]);
      const to: number = this.parseTimeToSeconds(row[1]);
      if (textRef === undefined || isNaN(from) || isNaN(to)) continue;
      timing.push({
        textRef,
        from,
        to
      } as AudioTiming);
    }
    timing.sort((a, b) => a.from - b.from);
    this.timing = timing;
    this.validateTimingEntries(this.timing, this._audioLength);
  }

  async save(): Promise<void> {
    const canSave: boolean =
      this.hasAudioBeenUploaded && this.hasTimingBeenUploaded && this.book != null && this.chapter != null;
    if (!this.hasTimingBeenUploaded) {
      this._timingErrorText = 'chapter_audio_dialog.no_timing_data_uploaded';
    }
    if (!this.hasAudioBeenUploaded) {
      this._audioErrorText = 'chapter_audio_dialog.no_audio_file_uploaded';
    }
    if (!canSave) {
      return;
    }
    this._loadingAudio = true;
    const audioUrl: string | undefined = await this.fileService.uploadFile(
      FileType.Audio,
      this.data.projectId,
      TextAudioDoc.COLLECTION,
      objectId(),
      getTextDocId(this.data.projectId, this.book, this.chapter),
      this.audio!.blob!,
      this.audio!.fileName!,
      true
    );
    this._loadingAudio = false;
    if (audioUrl == null) {
      this.dialogService.message('chapter_audio_dialog.upload_failed');
      return;
    }

    this.dialogRef.close({
      timingData: this.timing,
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
      audio.src = url;
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
   * It supports multiple time formats: ss, mm:ss, hh:mm:ss
   */
  private parseTimeToSeconds(time: string): number {
    const a: string[] = time?.split(':');
    if (a?.length === 1) {
      return parseFloat(time);
    } else if (a?.length === 2) {
      return +a[0] * 60 + +a[1];
    } else if (a?.length === 3) {
      return +a[0] * 60 * 60 + +a[1] * 60 + +a[2];
    }

    return NaN;
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

  private validateTimingEntries(timing: AudioTiming[], audioLength: number): void {
    this._timingErrorText = undefined;

    if (timing.length === 0) {
      this._timingErrorText = 'chapter_audio_dialog.zero_segments';
    }

    if (audioLength === 0) return;

    for (const timing of this.timing) {
      timing.to = this.populateToField(this.timing.indexOf(timing), this.timing);
    }

    // Check if one or more ending values end before their beginning values
    const firstValidation: AudioTiming[] = timing.filter(t => t.from < t.to);
    if (firstValidation.length !== timing.length) {
      this._timingErrorText = 'chapter_audio_dialog.from_timing_past_to_timing';
    }

    // Check if one or more timing values extend past the end of the audio file
    const validated: AudioTiming[] = firstValidation.filter(t => t.from < audioLength && t.to <= audioLength);
    if (validated.length !== firstValidation.length) {
      this._timingErrorText = 'chapter_audio_dialog.timing_past_audio_length';
    }
  }
}
