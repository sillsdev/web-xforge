import { Component, Inject } from '@angular/core';
import { CsvService } from 'xforge-common/csv-service.service';
import { AudioTiming } from 'realtime-server/lib/esm/scriptureforge/models/audio-timing';
import { I18nService } from 'xforge-common/i18n.service';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Canon } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/canon';
import { TextInfo } from 'realtime-server//lib/esm/scriptureforge/models/text-info';
import { FileService } from 'xforge-common/file.service';
import { FileType } from 'xforge-common/models/file-offline-data';
import { objectId } from 'xforge-common/utils';
import { getTextDocId } from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import { TextsByBookId } from '../../core/models/texts-by-book-id';
import { TextAudioDoc } from '../../core/models/text-audio-doc';
import { AudioAttachment } from '../checking/checking-audio-recorder/checking-audio-recorder.component';

export interface ChapterAudioDialogData {
  projectId: string;
  textsByBookId: TextsByBookId;
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
  private _book: number;
  private _chapter: number;
  private timing: AudioTiming[] = [];
  constructor(
    readonly i18n: I18nService,
    @Inject(MAT_DIALOG_DATA) public data: ChapterAudioDialogData,
    private readonly csvService: CsvService,
    private readonly dialogRef: MatDialogRef<ChapterAudioDialogComponent, ChapterAudioDialogResult | undefined>,
    private readonly fileService: FileService
  ) {
    // TODO: Make this smarter i.e. base off books that have questions setup and no audio attached
    this._book = this.books[0];
    this._chapter = 1;
  }

  get book(): number {
    return this._book;
  }

  set book(book: number) {
    this._book = book;
    this.chapter = this.chapters[0];
  }

  get chapter(): number {
    return this._chapter;
  }

  set chapter(chapter: number) {
    this._chapter = chapter;
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

  audioUpdate(audio: AudioAttachment): void {
    this.audio = audio;
  }

  async prepareTimingFileUpload(file: File): Promise<void> {
    // TODO: Add support for Adobe Audition marker exports
    const result: string[][] = await this.csvService.parse(file);
    const timing: AudioTiming[] = [];
    for (const [_, row] of result.entries()) {
      // TODO: Determine if a header needs to be ignored
      const textRef: string = row[2];
      const from: number = this.parseTime(row[0]);
      const to: number = this.parseTime(row[1]);
      timing.push({
        textRef,
        from,
        to
      } as AudioTiming);
    }
    timing.sort((a, b) => a.from - b.from);
    this.timing = timing;
    // TODO: Add validation to ensure timing markers match a relevant segment in the text
  }

  async save(): Promise<void> {
    // TODO: Improve validation including a check if uploading data to a chapter that already contains data
    if (this.audio?.blob == null || this.audio?.fileName == null) {
      return;
    }
    // TODO: Implement progress UI as these files can be hundreds of MB
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
    if (audioUrl == null) {
      // TODO: Show an error
      return;
    }
    this.dialogRef.close({
      timingData: this.timing,
      book: this.book,
      chapter: this.chapter,
      audioUrl
    });
  }

  private parseTime(time: string): number {
    // TODO: Add support for hh:mm:ss and mm:ss strings
    return parseFloat(time);
  }
}
