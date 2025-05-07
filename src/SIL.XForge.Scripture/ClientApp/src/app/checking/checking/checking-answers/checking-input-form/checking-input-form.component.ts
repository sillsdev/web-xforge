import { BreakpointObserver, BreakpointState } from '@angular/cdk/layout';
import { Component, DestroyRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { Answer } from 'realtime-server/lib/esm/scriptureforge/models/answer';
import { Comment } from 'realtime-server/lib/esm/scriptureforge/models/comment';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { VerseRefData } from 'realtime-server/lib/esm/scriptureforge/models/verse-ref-data';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nService } from 'xforge-common/i18n.service';
import { Breakpoint, MediaBreakpointService } from 'xforge-common/media-breakpoints/media-breakpoint.service';
import { NoticeService } from 'xforge-common/notice.service';
import { quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { QuestionDoc } from '../../../../core/models/question-doc';
import { TextsByBookId } from '../../../../core/models/texts-by-book-id';
import {
  TextChooserDialogComponent,
  TextChooserDialogData,
  TextSelection
} from '../../../../text-chooser-dialog/text-chooser-dialog.component';
import { CheckingUtils } from '../../../checking.utils';
import { TextAndAudioComponent } from '../../../text-and-audio/text-and-audio.component';
import { AudioAttachment } from '../../checking-audio-player/checking-audio-player.component';
export interface CheckingInput {
  text?: string;
  audio?: AudioAttachment;
  selectedText?: string;
  selectionStartClipped?: boolean;
  selectionEndClipped?: boolean;
  verseRef?: VerseRefData;
}

function isAnswer(value: Answer | Comment | undefined): value is Answer {
  return value != null && 'verseRef' in value;
}

@Component({
  selector: 'app-checking-input-form',
  templateUrl: './checking-input-form.component.html',
  styleUrls: ['./checking-input-form.component.scss']
})
export class CheckingInputFormComponent {
  @Input() project?: SFProjectProfile;
  @Input() textSelectionEnabled: boolean = false;
  @Input() textsByBookId?: TextsByBookId;
  @Input() label: 'comment' | 'answer' = 'comment';
  @Output() save: EventEmitter<CheckingInput> = new EventEmitter<CheckingInput>();
  @Output() cancel: EventEmitter<void> = new EventEmitter<void>();
  @ViewChild(TextAndAudioComponent) textAndAudio?: TextAndAudioComponent;

  selectedText?: string;
  isScreenSmall: boolean = false;
  submittingResponse: boolean = false;

  private verseRef?: VerseRefData;
  private selectionStartClipped?: boolean = false;
  private selectionEndClipped?: boolean = false;
  private _questionDoc?: QuestionDoc;
  private textAndAudioInput?: { text?: string; audioUrl?: string };

  constructor(
    readonly noticeService: NoticeService,
    private readonly dialogService: DialogService,
    private readonly i18n: I18nService,
    private readonly breakpointObserver: BreakpointObserver,
    private readonly mediaBreakpointService: MediaBreakpointService,
    private destroyRef: DestroyRef
  ) {
    this.breakpointObserver
      .observe(this.mediaBreakpointService.width('<', Breakpoint.MD))
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe((state: BreakpointState) => {
        this.isScreenSmall = state.matches;
      });
  }

  @Input() set questionDoc(value: QuestionDoc | undefined) {
    this._questionDoc = value;
  }

  @Input() set checkingInput(value: Comment | Answer | undefined) {
    if (isAnswer(value) && this.textSelectionEnabled) {
      this.selectedText = value?.scriptureText;
      this.verseRef = value?.verseRef;
    }
    this.textAndAudioInput = value;
  }

  get checkingInput(): { text?: string; audioUrl?: string } | undefined {
    return this.textAndAudioInput;
  }

  selectScripture(): void {
    if (!this.textSelectionEnabled || this.textsByBookId == null || this._questionDoc?.data == null) return;
    const verseRef = this._questionDoc.data.verseRef;

    const dialogData: TextChooserDialogData = {
      bookNum: (this.verseRef && this.verseRef.bookNum) || verseRef.bookNum,
      chapterNum: (this.verseRef && this.verseRef.chapterNum) || verseRef.chapterNum,
      textsByBookId: this.textsByBookId,
      projectId: this._questionDoc.data.projectRef,
      isRightToLeft: this.project?.isRightToLeft,
      selectedText: this.selectedText || '',
      selectedVerses: this.verseRef
    };
    const dialogRef = this.dialogService.openMatDialog(TextChooserDialogComponent, { data: dialogData });
    dialogRef.afterClosed().subscribe(result => {
      if (result != null && result !== 'close') {
        const selection = result as TextSelection;
        this.verseRef = selection.verses;
        this.selectedText = selection.text;
        this.selectionStartClipped = selection.startClipped;
        this.selectionEndClipped = selection.endClipped;
      }
    });
  }

  clearSelection(): void {
    if (!this.textSelectionEnabled) return;
    this.selectedText = '';
    this.verseRef = undefined;
    this.selectionStartClipped = undefined;
    this.selectionEndClipped = undefined;
  }

  scriptureTextVerseRef(): string {
    return CheckingUtils.scriptureTextVerseRef(this.verseRef, this.i18n);
  }

  async submit(): Promise<void> {
    if (this.textAndAudio != null) {
      this.textAndAudio.suppressErrors = false;
    }
    if (!this.textAndAudio?.hasTextOrAudio()) {
      this.textAndAudio?.text.setErrors({ invalid: true });
      return;
    }
    this.submittingResponse = true;
    const response: CheckingInput = {
      text: this.textAndAudio.text.value,
      audio: this.textAndAudio.audioAttachment,
      selectedText: this.selectedText,
      selectionStartClipped: this.selectionStartClipped,
      selectionEndClipped: this.selectionEndClipped,
      verseRef: this.verseRef
    };
    this.save.emit(response);
  }

  submitCancel(): void {
    this.clearSelection();
    this.cancel.emit();
  }
}
