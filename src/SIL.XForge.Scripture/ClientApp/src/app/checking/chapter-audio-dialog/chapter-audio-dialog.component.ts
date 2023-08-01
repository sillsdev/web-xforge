import { Component, Inject, OnInit } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { TextInfo } from 'realtime-server//lib/esm/scriptureforge/models/text-info';
import { AudioTiming } from 'realtime-server/lib/esm/scriptureforge/models/audio-timing';
import { getTextDocId } from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import { Canon } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/canon';
import { QuestionDoc } from 'src/app/core/models/question-doc';
import { SFProjectProfileDoc } from 'src/app/core/models/sf-project-profile-doc';
import { TextAudioDoc } from 'src/app/core/models/text-audio-doc';
import { SFProjectService } from 'src/app/core/sf-project.service';
import { CsvService } from 'xforge-common/csv-service.service';
import { FileService } from 'xforge-common/file.service';
import { I18nService } from 'xforge-common/i18n.service';
import { FileType } from 'xforge-common/models/file-offline-data';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { objectId } from 'xforge-common/utils';
import { TextsByBookId } from '../../core/models/texts-by-book-id';
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
export class ChapterAudioDialogComponent extends SubscriptionDisposable implements OnInit {
  private audio?: AudioAttachment;
  private _book: number = this.books[0];
  private _chapter: number = 1;
  private timing: AudioTiming[] = [];
  private projectDoc!: SFProjectProfileDoc;
  private questionsQuery!: RealtimeQuery<QuestionDoc>;
  private _selectionHasAudioAlready = false;
  private _hasTimingBeenUploaded = false;

  constructor(
    readonly i18n: I18nService,
    @Inject(MAT_DIALOG_DATA) public data: ChapterAudioDialogData,
    private readonly csvService: CsvService,
    private readonly dialogRef: MatDialogRef<ChapterAudioDialogComponent, ChapterAudioDialogResult | undefined>,
    private readonly fileService: FileService,
    private readonly projectService: SFProjectService
  ) {
    super();
  }

  async ngOnInit(): Promise<void> {
    this.projectDoc = await this.projectService.getProfile(this.data.projectId);
    this.questionsQuery = await this.projectService.queryQuestions(this.data.projectId, { activeOnly: true });

    this.getStartingLocation();
  }

  private getStartingLocation(): void {
    const sortedByChapter = [...this.questionsQuery.docs].sort(
      (a, b) => a.data?.verseRef.chapterNum! - b.data?.verseRef.chapterNum!
    );
    const sortedByBookChapter = sortedByChapter.sort((a, b) => a.data?.verseRef.bookNum! - b.data?.verseRef.bookNum!);

    for (const question of sortedByBookChapter) {
      const book = question.data?.verseRef.bookNum!;
      const chapter = question.data?.verseRef.chapterNum;

      const text = this.projectDoc.data?.texts.find(t => t.bookNum === book);
      const textChapter = text?.chapters.find(c => c.number === chapter);
      if (!textChapter?.hasAudio) {
        this._book = book;
        this._chapter = textChapter?.number!;
        return;
      }
    }
  }

  get selectionHasAudioAlready(): boolean {
    return this._selectionHasAudioAlready;
  }

  private checkForPreexistingAudio(): void {
    const text = this.projectDoc.data?.texts.find(t => t.bookNum === this.book);
    const textChapter = text?.chapters.find(c => c.number === this.chapter);
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
    this._hasTimingBeenUploaded = true;
    // TODO: Add validation to ensure timing markers match a relevant segment in the text
  }

  async save(): Promise<void> {
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

    for (const timing of this.timing) {
      timing.to = await this.populateToField(this.timing.indexOf(timing), this.timing);
    }

    this.dialogRef.close({
      timingData: this.timing,
      book: this.book,
      chapter: this.chapter,
      audioUrl
    });
  }

  private async populateToField(index: number, rows: AudioTiming[]): Promise<number> {
    const row: AudioTiming = rows[index];
    const to: number = row.to;
    if (to > 0) return to;

    if (index < rows.length - 1) {
      const nextRow: AudioTiming = rows[index + 1];
      const nextTo: number = nextRow.from;
      return nextTo;
    } else {
      return await this.getDuration(this.audio!.url!);
    }
  }

  private getDuration(src: string): Promise<number> {
    return new Promise(function (resolve) {
      var audio = new Audio();
      audio.addEventListener('loadedmetadata', function () {
        resolve(audio.duration);
      });
      audio.src = src;
    });
  }

  private parseTime(time: string): number {
    // TODO: Add support for hh:mm:ss and mm:ss strings
    return parseFloat(time);
  }
}
