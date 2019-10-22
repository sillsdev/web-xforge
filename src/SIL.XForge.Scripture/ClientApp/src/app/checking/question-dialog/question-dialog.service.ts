import { MdcDialog, MdcDialogConfig, MdcDialogRef } from '@angular-mdc/web';
import { Injectable } from '@angular/core';
import { Question } from 'realtime-server/lib/scriptureforge/models/question';
import { fromVerseRef } from 'realtime-server/lib/scriptureforge/models/verse-ref-data';
import { QuestionDoc } from 'src/app/core/models/question-doc';
import { UserService } from 'xforge-common/user.service';
import { objectId } from 'xforge-common/utils';
import { SFProjectService } from '../../core/sf-project.service';
import { QuestionDialogComponent, QuestionDialogData, QuestionDialogResult } from './question-dialog.component';

@Injectable({
  providedIn: 'root'
})
export class QuestionDialogService {
  constructor(
    private readonly dialog: MdcDialog,
    private readonly projectService: SFProjectService,
    private readonly userService: UserService
  ) {}

  /** Opens a question dialog that can be used to add a new question or edit an existing question. */
  async questionDialog(config: QuestionDialogData, questionDoc?: QuestionDoc): Promise<QuestionDoc | undefined> {
    const dialogConfig: MdcDialogConfig = { data: config };
    const dialogRef = this.dialog.open(QuestionDialogComponent, dialogConfig) as MdcDialogRef<
      QuestionDialogComponent,
      QuestionDialogResult | 'close'
    >;
    const result: QuestionDialogResult | 'close' | undefined = await dialogRef.afterClosed().toPromise();
    if (result == null || result === 'close') {
      return questionDoc;
    }
    const questionId = questionDoc != null && questionDoc.data != null ? questionDoc.data.dataId : objectId();
    const verseRefData = fromVerseRef(result.verseRef);
    const text = result.text;
    let audioUrl = questionDoc != null && questionDoc.data != null ? questionDoc.data.audioUrl : undefined;
    if (result.audio.fileName && result.audio.blob != null) {
      const response = await this.projectService.onlineUploadAudio(
        config.projectId,
        questionId,
        new File([result.audio.blob], result.audio.fileName)
      );
      // Get the amended filename and save it against the answer
      audioUrl = response;
    } else if (result.audio.status === 'reset') {
      audioUrl = undefined;
    }

    const currentDate = new Date().toJSON();
    if (questionDoc != null && questionDoc.data != null) {
      const deleteAudio = questionDoc.data.audioUrl != null && audioUrl == null;
      await questionDoc.submitJson0Op(op =>
        op
          .set(q => q.verseRef, verseRefData)
          .set(q => q.text!, text)
          .set(q => q.audioUrl, audioUrl)
          .set(q => q.dateModified, currentDate)
      );
      if (deleteAudio) {
        await this.projectService.onlineDeleteAudio(
          config.projectId,
          questionDoc.data.dataId,
          questionDoc.data.ownerRef
        );
      }
      return questionDoc;
    }
    const newQuestion: Question = {
      dataId: questionId,
      projectRef: config.projectId,
      ownerRef: this.userService.currentUserId,
      verseRef: verseRefData,
      text,
      audioUrl,
      answers: [],
      isArchived: false,
      dateCreated: currentDate,
      dateModified: currentDate
    };
    return await this.projectService.createQuestion(config.projectId, newQuestion);
  }
}
