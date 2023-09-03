import { Component, Inject } from '@angular/core';
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
export class ChapterAudioDialogComponent {
  private audio?: AudioAttachment;
  private _book: number = this.books[0];
  private _chapter: number = 1;
  private timing: AudioTiming[] = [];
  private _selectionHasAudioAlready: boolean = false;
  private _hasTimingBeenUploaded: boolean = false;
  private _audioLength: number = 0;
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

  private getStartingLocation(): void {
    if (this.data.currentBook !== undefined && this.data.currentChapter !== undefined) {
      this._book = this.data.currentBook;
      this._chapter = this.data.currentChapter;
      return;
    }

    const publishedQuestions = this.data.questionsSorted.filter(q => !q.data?.isArchived);
    for (const question of publishedQuestions) {
      const bookNum = question.data?.verseRef.bookNum;
      const chapterNum = question.data?.verseRef.chapterNum;

      if (bookNum === undefined || chapterNum === undefined) continue;

      const text: TextInfo = this.data.textsByBookId[Canon.bookNumberToId(bookNum)];
      const textChapter = text?.chapters.find(c => c.number === chapterNum);
      if (textChapter !== undefined && !textChapter?.hasAudio) {
        this._book = bookNum;
        this._chapter = textChapter.number!;
        return;
      }
    }
  }

  get selectionHasAudioAlready(): boolean {
    return this._selectionHasAudioAlready;
  }

  private checkForPreexistingAudio(): void {
    const text: TextInfo = this.data.textsByBookId[Canon.bookNumberToId(this.book)];
    const textChapter: Chapter | undefined = text?.chapters.find(c => c.number === this.chapter);
    this._selectionHasAudioAlready = textChapter?.hasAudio ?? false;
  }

  get book(): number {
    return this._book;
  }

  set book(book: number) {
    this._book = book;
    this.chapter = this.chapters[0];
    this.checkForPreexistingAudio();
  }

  get chapter(): number {
    return this._chapter;
  }

  set chapter(chapter: number) {
    this._chapter = chapter;
    this.checkForPreexistingAudio();
  }

  get books(): number[] {
    return Object.values(this.data.textsByBookId).map(t => t.bookNum);
  }

  get chapters(): number[] {
    if (this.book === 0) {
      return [];
    }
    const bookAbbr: string = Canon.bookNumberToId(this.book);
    const text: TextInfo = this.data.textsByBookId[bookAbbr];
    return text.chapters.map(c => c.number);
  }

  get numberOfTimingSegments(): number {
    return this.timing.length;
  }

  get hasTimingBeenUploaded(): boolean {
    return this._hasTimingBeenUploaded;
  }

  get errorMessage(): string {
    return this._timingErrorText ?? '';
  }

  get isLoadingAudio(): boolean {
    return this._loadingAudio;
  }

  async audioUpdate(audio: AudioAttachment): Promise<void> {
    this.audio = audio;
    if (audio.url) {
      await this.getDuration(audio.url).then(l => {
        this._audioLength = l;
        if (this._hasTimingBeenUploaded) {
          this.validateTimingEntries(this.timing, this._audioLength);
        }
      });
    }
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
    this._hasTimingBeenUploaded = true;
    this.validateTimingEntries(this.timing, this._audioLength);
  }

  private validateTimingEntries(timing: AudioTiming[], audioLength: number): void {
    this._timingErrorText = undefined;

    if (timing.length === 0) {
      this._timingErrorText = 'checking_audio_dialog.zero_segments';
    }

    if (audioLength === 0) return;

    for (const timing of this.timing) {
      timing.to = this.populateToField(this.timing.indexOf(timing), this.timing);
    }

    const firstValidation = timing.filter(t => t.from < t.to);
    if (firstValidation.length !== timing.length) {
      this._timingErrorText = 'checking_audio_dialog.from_timing_past_to_timing';
    }

    const validated = firstValidation.filter(t => t.from < audioLength && t.to <= audioLength);
    if (validated.length !== firstValidation.length) {
      this._timingErrorText = 'checking_audio_dialog.timing_past_audio_length';
    }
  }

  async save(): Promise<void> {
    if (this.audio?.blob == null || this.audio?.fileName == null || this.timing.length === 0) {
      return;
    }
    this._loadingAudio = true;
    const audioUrl: string | undefined = await this.fileService.uploadFile(
      FileType.Audio,
      this.data.projectId,
      TextAudioDoc.COLLECTION,
      objectId(),
      getTextDocId(this.data.projectId, this.book, this.chapter),
      this.audio.blob,
      this.audio.fileName,
      true
    );
    this._loadingAudio = false;
    if (audioUrl == null) {
      this.dialogService.message('checking_audio_dialog.upload_failed');
      return;
    }

    this.dialogRef.close({
      timingData: this.timing,
      book: this.book,
      chapter: this.chapter,
      audioUrl
    });
  }

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

  /**
   * It supports multiple time formats: ss, mm:ss, hh:mm:ss
   */
  private parseTimeToSeconds(time: string): number {
    const a: string[] = time?.split(':');
    if (a?.length === 1) {
      return parseFloat(time);
    } else if (a?.length === 2) {
      const seconds = +a[0] * 60 + +a[1];
      return seconds;
    } else if (a?.length === 3) {
      const seconds = +a[0] * 60 * 60 + +a[1] * 60 + +a[2];
      return seconds;
    }

    return NaN;
  }
}
