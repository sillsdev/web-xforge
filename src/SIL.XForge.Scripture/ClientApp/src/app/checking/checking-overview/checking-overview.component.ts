import { MdcDialog, MdcDialogConfig, MdcDialogRef } from '@angular-mdc/web';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { distanceInWordsToNow } from 'date-fns';
import { Question } from 'realtime-server/lib/scriptureforge/models/question';
import { SFProjectRole } from 'realtime-server/lib/scriptureforge/models/sf-project-role';
import { getTextDocId } from 'realtime-server/lib/scriptureforge/models/text-data';
import { TextInfo } from 'realtime-server/lib/scriptureforge/models/text-info';
import { fromVerseRef } from 'realtime-server/lib/scriptureforge/models/verse-ref-data';
import { Canon } from 'realtime-server/lib/scriptureforge/scripture-utils/canon';
import { VerseRef } from 'realtime-server/lib/scriptureforge/scripture-utils/verse-ref';
import { merge, Subscription } from 'rxjs';
import { map } from 'rxjs/operators';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { NoticeService } from 'xforge-common/notice.service';
import { UserService } from 'xforge-common/user.service';
import { objectId } from 'xforge-common/utils';
import { QuestionDoc } from '../../core/models/question-doc';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { SFProjectUserConfigDoc } from '../../core/models/sf-project-user-config-doc';
import { TextDocId } from '../../core/models/text-doc';
import { TextsByBookId } from '../../core/models/texts-by-book-id';
import { SFProjectService } from '../../core/sf-project.service';
import { CheckingUtils } from '../checking.utils';
import { QuestionAnsweredDialogComponent } from '../question-answered-dialog/question-answered-dialog.component';
import {
  QuestionDialogComponent,
  QuestionDialogData,
  QuestionDialogResult
} from '../question-dialog/question-dialog.component';

@Component({
  selector: 'app-checking-overview',
  templateUrl: './checking-overview.component.html',
  styleUrls: ['./checking-overview.component.scss']
})
export class CheckingOverviewComponent extends DataLoadingComponent implements OnInit, OnDestroy {
  itemVisible: { [bookIdOrDocId: string]: boolean } = {};
  itemVisibleArchived: { [bookIdOrDocId: string]: boolean } = {};
  questionDocs: { [docId: string]: QuestionDoc[] } = {};
  texts: TextInfo[] = [];
  projectId: string;

  private textsByBookId: TextsByBookId;
  private projectDoc: SFProjectDoc;
  private dataChangesSub: Subscription;
  private projectUserConfigDoc: SFProjectUserConfigDoc;
  private questionsQuery: RealtimeQuery<QuestionDoc>;

  constructor(
    private readonly activatedRoute: ActivatedRoute,
    private readonly dialog: MdcDialog,
    noticeService: NoticeService,
    private readonly projectService: SFProjectService,
    private readonly userService: UserService
  ) {
    super(noticeService);
  }

  get allQuestionsCount(): string {
    if (this.questionDocs == null) {
      return '-';
    }

    return '' + this.allPublishedQuestions.length;
  }

  get myAnswerCount(): string {
    if (this.questionDocs == null) {
      return '-';
    }

    let count: number = 0;
    for (const questionDoc of this.allPublishedQuestions) {
      if (this.isProjectAdmin) {
        count += questionDoc.data.answers.length;
      } else {
        count += questionDoc.data.answers.filter(a => a.ownerRef === this.userService.currentUserId).length;
      }
    }

    return '' + count;
  }

  get myLikeCount(): string {
    if (this.questionDocs == null) {
      return '-';
    }

    let count: number = 0;
    for (const questionDoc of this.allPublishedQuestions) {
      for (const answer of questionDoc.data.answers) {
        if (this.isProjectAdmin) {
          count += answer.likes.length;
        } else {
          count += answer.likes.filter(l => l.ownerRef === this.userService.currentUserId).length;
        }
      }
    }

    return '' + count;
  }

  get myCommentCount(): string {
    if (this.questionDocs == null) {
      return '-';
    }

    let count: number = 0;
    for (const questionDoc of this.allPublishedQuestions) {
      for (const answer of questionDoc.data.answers) {
        if (this.isProjectAdmin) {
          count += answer.comments.length;
        } else {
          count += answer.comments.filter(c => c.ownerRef === this.userService.currentUserId).length;
        }
      }
    }

    return '' + count;
  }

  get isProjectAdmin(): boolean {
    return (
      this.projectDoc != null &&
      this.projectDoc.data != null &&
      this.projectDoc.data.userRoles[this.userService.currentUserId] === SFProjectRole.ParatextAdministrator
    );
  }

  get allArchivedQuestionsCount(): number {
    if (this.questionsQuery == null) {
      return 0;
    }
    return this.questionsQuery.docs.filter(qd => qd.data.isArchived === true).length;
  }

  private get allPublishedQuestions(): QuestionDoc[] {
    if (this.questionsQuery == null) {
      return [];
    }
    return this.questionsQuery.docs.filter(qd => qd.data.isArchived !== true);
  }

  ngOnInit(): void {
    this.subscribe(this.activatedRoute.params.pipe(map(params => params['projectId'])), async projectId => {
      this.loadingStarted();
      this.projectId = projectId;
      try {
        this.projectDoc = await this.projectService.get(projectId);
        this.projectUserConfigDoc = await this.projectService.getUserConfig(projectId, this.userService.currentUserId);
        if (this.questionsQuery != null) {
          this.questionsQuery.dispose();
        }
        this.questionsQuery = await this.projectService.getQuestions(projectId);
        await this.initTexts();
      } finally {
        this.loadingFinished();
      }

      if (this.dataChangesSub != null) {
        this.dataChangesSub.unsubscribe();
      }
      this.dataChangesSub = merge(this.projectDoc.remoteChanges$, this.questionsQuery.remoteChanges$).subscribe(() => {
        this.loadingStarted();
        try {
          this.initTexts();
        } finally {
          this.loadingFinished();
        }
      });
    });
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
    if (this.dataChangesSub != null) {
      this.dataChangesSub.unsubscribe();
    }
    if (this.questionsQuery != null) {
      this.questionsQuery.dispose();
    }
  }

  getTextDocId(bookNum: number, chapter: number): string {
    return getTextDocId(this.projectDoc.id, bookNum, chapter);
  }

  getQuestionDocs(textDocId: TextDocId, fromArchive = false): QuestionDoc[] {
    if (fromArchive) {
      return this.questionDocs[textDocId.toString()].filter(qd => qd.data.isArchived === true);
    }
    return this.questionDocs[textDocId.toString()].filter(qd => qd.data.isArchived !== true);
  }

  bookQuestionCount(text: TextInfo, fromArchive = false): number {
    let count: number;
    for (const chapter of text.chapters) {
      const questionCount = this.questionCount(text.bookNum, chapter.number, fromArchive);
      if (questionCount) {
        if (!count) {
          count = 0;
        }
        count += questionCount;
      }
    }
    return count;
  }

  dateInWords(date: string): string {
    return distanceInWordsToNow(new Date(date));
  }

  questionCount(bookNum: number, chapterNumber: number, fromArchive = false): number {
    const id = new TextDocId(this.projectDoc.id, bookNum, chapterNumber);
    if (!(id.toString() in this.questionDocs)) {
      return undefined;
    }
    if (fromArchive) {
      return this.questionDocs[id.toString()].filter(qd => qd.data.isArchived === true).length;
    }
    return this.questionDocs[id.toString()].filter(qd => qd.data.isArchived !== true).length;
  }

  questionCountLabel(count: number): string {
    return count ? count + ' questions' : '';
  }

  bookAnswerCount(text: TextInfo): number {
    let count: number;
    for (const chapter of text.chapters) {
      const answerCount = this.chapterAnswerCount(text.bookNum, chapter.number);
      if (answerCount) {
        if (!count) {
          count = 0;
        }
        count += answerCount;
      }
    }
    return count;
  }

  chapterAnswerCount(bookNum: number, chapterNumber: number): number {
    const id = new TextDocId(this.projectDoc.id, bookNum, chapterNumber);
    if (!(id.toString() in this.questionDocs)) {
      return undefined;
    }

    let count: number;
    for (const q of this.getQuestionDocs(id)) {
      const answerCount = q.data.answers.length;
      if (answerCount) {
        if (!count) {
          count = 0;
        }
        count += answerCount;
      }
    }

    return count;
  }

  answerCountLabel(count: number): string {
    return count ? count + ' answers' : '';
  }

  setQuestionArchiveStatus(questionDoc: QuestionDoc, archiveStatus: boolean) {
    questionDoc.submitJson0Op(op => {
      op.set(q => q.isArchived, archiveStatus);
      if (archiveStatus) {
        op.set(q => q.dateArchived, new Date().toJSON());
      } else {
        op.unset(q => q.dateArchived);
      }
    });
  }

  overallProgress(): number[] {
    let totalUnread: number = 0;
    let totalRead: number = 0;
    let totalAnswered: number = 0;
    for (const text of this.texts) {
      const [unread, read, answered] = this.bookProgress(text);
      totalUnread += unread;
      totalRead += read;
      totalAnswered += answered;
    }

    return [totalUnread, totalRead, totalAnswered];
  }

  bookProgress(text: TextInfo): number[] {
    let unread: number = 0;
    let read: number = 0;
    let answered: number = 0;
    for (const chapter of text.chapters) {
      const id = new TextDocId(this.projectId, text.bookNum, chapter.number);
      if (!(id.toString() in this.questionDocs)) {
        continue;
      }

      for (const questionDoc of this.getQuestionDocs(id)) {
        if (CheckingUtils.hasUserAnswered(questionDoc.data, this.userService.currentUserId)) {
          answered++;
        } else if (CheckingUtils.hasUserReadQuestion(questionDoc.data, this.projectUserConfigDoc.data)) {
          read++;
        } else {
          unread++;
        }
      }
    }

    return [unread, read, answered];
  }

  async questionDialog(questionDoc?: QuestionDoc): Promise<void> {
    if (questionDoc != null) {
      if (questionDoc.data.answers.length > 0) {
        const answeredDialogRef = this.dialog.open(QuestionAnsweredDialogComponent);
        const response = (await answeredDialogRef.afterClosed().toPromise()) as string;
        if (response === 'close') {
          return;
        }
      }
    }
    const dialogConfig: MdcDialogConfig<QuestionDialogData> = {
      data: {
        question: questionDoc != null ? questionDoc.data : undefined,
        textsByBookId: this.textsByBookId,
        projectId: this.projectDoc.id
      }
    };
    const dialogRef = this.dialog.open(QuestionDialogComponent, dialogConfig) as MdcDialogRef<
      QuestionDialogComponent,
      QuestionDialogResult | 'close'
    >;

    dialogRef.afterClosed().subscribe(async result => {
      if (result === 'close') {
        return;
      }
      const questionId = questionDoc != null ? questionDoc.data.dataId : objectId();
      const verseRef = fromVerseRef(result.verseRef);
      const text = result.text;
      let audioUrl = questionDoc != null ? questionDoc.data.audioUrl : undefined;
      if (result.audio.fileName) {
        const response = await this.projectService.onlineUploadAudio(
          this.projectId,
          questionId,
          new File([result.audio.blob], result.audio.fileName)
        );
        // Get the amended filename and save it against the answer
        audioUrl = response;
      } else if (result.audio.status === 'reset') {
        audioUrl = undefined;
      }

      const currentDate = new Date().toJSON();
      if (questionDoc != null) {
        const deleteAudio = questionDoc.data.audioUrl != null && audioUrl == null;
        const oldVerseRef = questionDoc.data.verseRef;
        const moveToDifferentChapter =
          oldVerseRef.bookNum !== verseRef.bookNum || oldVerseRef.chapterNum !== verseRef.chapterNum;
        if (moveToDifferentChapter) {
          this.removeQuestionDoc(questionDoc);
        }
        await questionDoc.submitJson0Op(op =>
          op
            .set(q => q.verseRef, verseRef)
            .set(q => q.text, text)
            .set(q => q.audioUrl, audioUrl)
            .set(q => q.dateModified, currentDate)
        );
        if (deleteAudio) {
          await this.projectService.onlineDeleteAudio(
            this.projectDoc.id,
            questionDoc.data.dataId,
            questionDoc.data.ownerRef
          );
        }
        if (moveToDifferentChapter) {
          this.addQuestionDoc(questionDoc);
        }
      } else {
        const newQuestion: Question = {
          dataId: questionId,
          projectRef: this.projectId,
          ownerRef: this.userService.currentUserId,
          verseRef,
          text,
          audioUrl,
          answers: [],
          isArchived: false,
          dateCreated: currentDate,
          dateModified: currentDate
        };
        questionDoc = await this.projectService.createQuestion(this.projectId, newQuestion);
        this.addQuestionDoc(questionDoc);
      }
    });
  }

  getBookName(text: TextInfo): string {
    return Canon.bookNumberToEnglishName(text.bookNum);
  }

  getBookId(text: TextInfo): string {
    return Canon.bookNumberToId(text.bookNum);
  }

  private initTexts(): void {
    if (this.projectDoc == null || this.projectDoc.data == null) {
      return;
    }

    this.questionDocs = {};
    this.textsByBookId = {};
    this.texts = [];
    for (const text of this.projectDoc.data.texts) {
      this.textsByBookId[Canon.bookNumberToId(text.bookNum)] = text;
      this.texts.push(text);
      for (const chapter of text.chapters) {
        const textId = new TextDocId(this.projectDoc.id, text.bookNum, chapter.number);
        this.questionDocs[textId.toString()] = [];
      }
    }

    for (const questionDoc of this.questionsQuery.docs) {
      this.addQuestionDoc(questionDoc);
    }
  }

  private addQuestionDoc(questionDoc: QuestionDoc): void {
    const textId = new TextDocId(
      this.projectDoc.id,
      questionDoc.data.verseRef.bookNum,
      questionDoc.data.verseRef.chapterNum
    );
    this.questionDocs[textId.toString()].push(questionDoc);
  }

  private removeQuestionDoc(questionDoc: QuestionDoc): void {
    const textId = new TextDocId(
      this.projectDoc.id,
      questionDoc.data.verseRef.bookNum,
      questionDoc.data.verseRef.chapterNum
    );
    const chapterQuestionDocs = this.questionDocs[textId.toString()];
    const index = chapterQuestionDocs.indexOf(questionDoc);
    chapterQuestionDocs.splice(index, 1);
  }
}
