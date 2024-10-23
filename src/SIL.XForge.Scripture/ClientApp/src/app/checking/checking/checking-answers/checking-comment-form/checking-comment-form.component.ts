import { BreakpointObserver, BreakpointState } from '@angular/cdk/layout';
import { AfterViewInit, Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { translate } from '@ngneat/transloco';
import { VerseRef } from '@sillsdev/scripture';
import { Answer } from 'realtime-server/lib/esm/scriptureforge/models/answer';
import { Comment } from 'realtime-server/lib/esm/scriptureforge/models/comment';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { VerseRefData } from 'realtime-server/lib/esm/scriptureforge/models/verse-ref-data';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nService } from 'xforge-common/i18n.service';
import { Breakpoint, MediaBreakpointService } from 'xforge-common/media-breakpoints/media-breakpoint.service';
import { NoticeService } from 'xforge-common/notice.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { QuestionDoc } from '../../../../core/models/question-doc';
import { TextsByBookId } from '../../../../core/models/texts-by-book-id';
import {
  TextChooserDialogComponent,
  TextChooserDialogData,
  TextSelection
} from '../../../../text-chooser-dialog/text-chooser-dialog.component';
import { CheckingUtils } from '../../../checking.utils';
import { TextAndAudioComponent } from '../../../text-and-audio/text-and-audio.component';
import { AudioAttachment } from '../../checking-audio-recorder/checking-audio-recorder.component';

export interface CheckingResponse {
  text?: string;
  audio?: AudioAttachment;
  selectedText?: string;
  selectionStartClipped?: boolean;
  selectionEndClipped?: boolean;
  verseRef?: VerseRefData;
}

@Component({
  selector: 'app-checking-comment-form',
  templateUrl: './checking-comment-form.component.html',
  styleUrls: ['./checking-comment-form.component.scss']
})
export class CheckingCommentFormComponent extends SubscriptionDisposable implements AfterViewInit {
  @Input() project?: SFProjectProfile;
  @Input() textSelectionEnabled: boolean = false;
  @Input() textsByBookId?: TextsByBookId;
  @Output() save: EventEmitter<CheckingResponse> = new EventEmitter<CheckingResponse>();
  @Output() cancel: EventEmitter<void> = new EventEmitter<void>();
  @ViewChild(TextAndAudioComponent) textAndAudio?: TextAndAudioComponent;

  selectedText?: string;
  isScreenSmall: boolean = false;
  submittingResponse: boolean = false;
  verseRef?: VerseRefData;
  textAndAudioInput?: { text?: string; audioUrl?: string };
  compact: boolean = true;

  private selectionStartClipped?: boolean = false;
  private selectionEndClipped?: boolean = false;
  private _questionDoc?: QuestionDoc;

  constructor(
    readonly noticeService: NoticeService,
    private readonly dialogService: DialogService,
    private readonly i18n: I18nService,
    private readonly breakpointObserver: BreakpointObserver,
    private readonly mediaBreakpointService: MediaBreakpointService
  ) {
    super();
  }

  @Input() set questionDoc(value: QuestionDoc | undefined) {
    this._questionDoc = value;
  }

  @Input() set answer(value: Answer | undefined) {
    this.selectedText = value?.scriptureText;
    this.verseRef = value?.verseRef;
    this.compact = false;
    this.textAndAudioInput = value;
  }

  @Input() set comment(value: Comment | undefined) {
    this.textAndAudioInput = value;
  }

  ngAfterViewInit(): void {
    this.subscribe(
      this.breakpointObserver.observe(this.mediaBreakpointService.width('<', Breakpoint.MD)),
      (state: BreakpointState) => {
        this.isScreenSmall = state.matches;
      }
    );
  }

  selectScripture(): void {
    if (this.textsByBookId == null || this._questionDoc?.data == null) return;
    const verseRef = this._questionDoc.data.verseRef;

    const dialogData: TextChooserDialogData = {
      bookNum: (this.verseRef && this.verseRef.bookNum) || verseRef!.bookNum,
      chapterNum: (this.verseRef && this.verseRef.chapterNum) || verseRef!.chapterNum,
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
    this.selectedText = '';
    this.verseRef = undefined;
    this.selectionStartClipped = undefined;
    this.selectionEndClipped = undefined;
  }

  scriptureTextVerseRef(verseRef: VerseRefData | VerseRef | undefined): string {
    return CheckingUtils.scriptureTextVerseRef(verseRef, this.i18n);
  }

  async submit(): Promise<void> {
    if (this.textAndAudio != null) {
      this.textAndAudio.suppressErrors = false;
      if (this.textAndAudio.audioComponent?.isRecording) {
        await this.textAndAudio.audioComponent.stopRecording();
        this.noticeService.show(translate('checking_answers.recording_automatically_stopped'));
      }
    }
    if (!this.textAndAudio?.hasTextOrAudio()) {
      this.textAndAudio?.text.setErrors({ invalid: true });
      return;
    }
    this.submittingResponse = true;
    const response: CheckingResponse = {
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
