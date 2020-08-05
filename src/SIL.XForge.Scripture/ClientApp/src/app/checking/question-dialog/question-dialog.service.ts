import { MdcDialog, MdcDialogConfig, MdcDialogRef } from '@angular-mdc/web/dialog';
import { Injectable } from '@angular/core';
import { TranslocoService } from '@ngneat/transloco';
import { Operation } from 'realtime-server/lib/common/models/project-rights';
import { Question } from 'realtime-server/lib/scriptureforge/models/question';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from 'realtime-server/lib/scriptureforge/models/sf-project-rights';
import { fromVerseRef } from 'realtime-server/lib/scriptureforge/models/verse-ref-data';
import { FileType } from 'xforge-common/models/file-offline-data';
import { NoticeService } from 'xforge-common/notice.service';
import { UserService } from 'xforge-common/user.service';
import { objectId } from 'xforge-common/utils';
import { QuestionDoc } from '../../core/models/question-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { QuestionDialogComponent, QuestionDialogData, QuestionDialogResult } from './question-dialog.component';

@Injectable({
  providedIn: 'root'
})
export class QuestionDialogService {
  constructor(
    private readonly dialog: MdcDialog,
    private readonly projectService: SFProjectService,
    private readonly userService: UserService,
    private readonly noticeService: NoticeService,
    private readonly transloco: TranslocoService
  ) {}

  /** Opens a question dialog that can be used to add a new question or edit an existing question. */
  async questionDialog(config: QuestionDialogData): Promise<QuestionDoc | undefined> {
    const questionDoc = config.questionDoc;
    const dialogConfig: MdcDialogConfig = { data: config, clickOutsideToClose: false };
    const dialogRef = this.dialog.open(QuestionDialogComponent, dialogConfig) as MdcDialogRef<
      QuestionDialogComponent,
      QuestionDialogResult | 'close'
    >;
    const result: QuestionDialogResult | 'close' | undefined = await dialogRef.afterClosed().toPromise();
    if (result == null || result === 'close') {
      return questionDoc;
    }
    if (!(await this.canCreateAndEditQuestions(config.projectId))) {
      this.noticeService.show(this.transloco.translate('question_dialog.add_question_denied'));
      return undefined;
    }
    const questionId = questionDoc != null && questionDoc.data != null ? questionDoc.data.dataId : objectId();
    const verseRefData = fromVerseRef(result.verseRef);
    const text = result.text;
    let audioUrl = questionDoc != null && questionDoc.data != null ? questionDoc.data.audioUrl : undefined;
    if (questionDoc != null && result.audio.fileName != null && result.audio.blob != null) {
      // Get the amended filename and save it against the answer
      const urlResult = await questionDoc.uploadFile(
        FileType.Audio,
        questionId,
        result.audio.blob,
        result.audio.fileName
      );
      if (urlResult != null) {
        audioUrl = urlResult;
      }
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
        await questionDoc.deleteFile(FileType.Audio, questionDoc.data.dataId, questionDoc.data.ownerRef);
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
    return await this.projectService.createQuestion(
      config.projectId,
      newQuestion,
      result.audio.fileName,
      result.audio.blob
    );
  }

  private async canCreateAndEditQuestions(projectId: string): Promise<boolean> {
    const project = await this.projectService.get(projectId);
    if (project != null && project.data != null && this.userService.currentUserId in project.data.userRoles) {
      const role = project.data.userRoles[this.userService.currentUserId];
      return (
        SF_PROJECT_RIGHTS.hasRight(role, { projectDomain: SFProjectDomain.Questions, operation: Operation.Create }) &&
        SF_PROJECT_RIGHTS.hasRight(role, { projectDomain: SFProjectDomain.Questions, operation: Operation.Edit })
      );
    }
    return false;
  }
}
