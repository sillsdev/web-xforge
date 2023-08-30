import { Router } from '@angular/router';
import { translate } from '@ngneat/transloco';
import { Question } from 'realtime-server/lib/esm/scriptureforge/models/question';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { SFProjectUserConfig } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config';
import { NoticeService } from 'xforge-common/notice.service';
import { canAccessTranslateApp } from '../core/models/sf-project-role-info';
import { SFProjectUserConfigDoc } from '../core/models/sf-project-user-config-doc';

/** Detects if a string is in a format that can be used to parse audio timing for a verse of Scripture. */
const AUDIO_TEXT_REF_REGEX = /^v?([0-9]+-?[0-9]?)([a-z]?)_?([0-9]*)/i;

export interface AudioTextRef {
  verseStr?: string;
  phrase?: string;
  word?: string;
}

export interface CheckingAccessInfo {
  userId: string;
  projectId: string;
  project: SFProjectProfile;
  bookId?: string;
  projectUserConfigDoc: SFProjectUserConfigDoc;
}

export class CheckingUtils {
  static hasUserAnswered(question: Question | undefined, userId: string): boolean {
    if (question == null) {
      return false;
    }
    return question.answers.filter(answer => answer.ownerRef === userId && !answer.deleted).length > 0;
  }

  static hasUserReadQuestion(
    question: Question | undefined,
    projectUserConfig: SFProjectUserConfig | undefined
  ): boolean {
    return projectUserConfig != null && question != null
      ? projectUserConfig.questionRefsRead.includes(question.dataId)
      : false;
  }

  static onAppAccessRemoved(info: CheckingAccessInfo, router: Router, noticeService: NoticeService): void {
    // Remove the record of the state of the checking app so clicking 'Project Home' will not redirect there
    info.projectUserConfigDoc.submitJson0Op(op => {
      op.unset(puc => puc.selectedTask!);
      op.unset(puc => puc.selectedQuestionRef!);
    });
    let route = '/projects/' + info.projectId;
    if (canAccessTranslateApp(info.project.userRoles[info.userId] as SFProjectRole)) {
      route = info.bookId == null ? route + '/translate' : route + '/translate/' + info.bookId;
      router.navigateByUrl(route, { replaceUrl: true });
      noticeService.show(translate('app.scripture_checking_not_available'));
    } else {
      router.navigateByUrl(route, { replaceUrl: true });
    }
  }

  static parseAudioRef(segmentRef: string): AudioTextRef | undefined {
    const match: RegExpExecArray | null = AUDIO_TEXT_REF_REGEX.exec(segmentRef);
    if (match == null) {
      return;
    }
    return { verseStr: match[1], phrase: match[2], word: match[3] };
  }
}
