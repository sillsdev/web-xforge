import { Router } from '@angular/router';
import { translate } from '@ngneat/transloco';
import { AudioTiming } from 'realtime-server/lib/esm/scriptureforge/models/audio-timing';
import { Question } from 'realtime-server/lib/esm/scriptureforge/models/question';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { SFProjectUserConfig } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config';
import { VerseRefData } from 'realtime-server/lib/esm/scriptureforge/models/verse-ref-data';
import { NoticeService } from 'xforge-common/notice.service';
import { roleCanAccessTranslate } from '../core/models/sf-project-role-info';
import { SFProjectUserConfigDoc } from '../core/models/sf-project-user-config-doc';

/**
 * Detects if a string is in a format that can be used to parse audio timing for a verse of Scripture.
 * The audio ref can be formatted as v1, 1, 1-2, 1,3, 1a, and 1ab.
 */
const AUDIO_TEXT_REF_REGEX = /^v?([0-9]+[0-9a-z,\-]*?)([a-z]?$)/i;
const AUDIO_HEADING_REF_REGEX = /^([a-z]+)([0-9]*)$/i;

export interface AudioTextRef {
  verseStr: string;
  phrase?: string;
  word?: string;
}

export interface AudioHeadingRef {
  label: string;
  iteration: number;
}

export interface CheckingAccessInfo {
  userId: string;
  projectId: string;
  project: SFProjectProfile;
  bookId?: string;
  projectUserConfigDoc: SFProjectUserConfigDoc;
}

export interface BookChapter {
  bookNum?: number;
  chapterNum?: number;
}

const scopes = ['all', 'book', 'chapter'] as const;
export type QuestionScope = (typeof scopes)[number];

/**
 * Type guard for `QuestionScope`.
 */
export function isQuestionScope(scope: any): scope is QuestionScope {
  return scopes.includes(scope);
}

/**
 * Whether the `VerseRefData` book and chapter is the same as in the `BookChapter` obj.
 */
export function bookChapterMatchesVerseRef(bookChapter: BookChapter, verseRef: VerseRefData): boolean {
  return verseRef.bookNum === bookChapter.bookNum && verseRef.chapterNum === bookChapter.chapterNum;
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
    if (roleCanAccessTranslate(info.project.userRoles[info.userId] as SFProjectRole)) {
      route = info.bookId == null ? route + '/translate' : route + '/translate/' + info.bookId;
      router.navigateByUrl(route, { replaceUrl: true });
      noticeService.show(translate('app.scripture_checking_not_available'));
    } else {
      router.navigateByUrl(route, { replaceUrl: true });
    }
  }

  static parseAudioRef(ref: string): AudioTextRef | undefined {
    let audioTimingMatch: RegExpExecArray | null = AUDIO_TEXT_REF_REGEX.exec(ref);

    // return if the text ref is for a heading and not a verse
    if (audioTimingMatch == null) return;
    const audioTextRef: AudioTextRef = { verseStr: audioTimingMatch[1] };
    if (audioTimingMatch[2] !== '') audioTextRef.phrase = audioTimingMatch[2].toLowerCase();
    return audioTextRef;
  }

  /**
   * Finds the current audio text reference based on the current time.
   * @returns The audio text reference with the verse string, phrase, and word if available.
   * Undefined if the current text reference is for a heading.
   */
  static parseAudioRefByTime(timingData: AudioTiming[], currentTime: number): AudioTextRef | undefined {
    let indexInTimings: number = timingData.findIndex(t => t.to > currentTime);
    for (indexInTimings; indexInTimings >= 0; indexInTimings--) {
      // find the first non-empty textRef because phrase level timings can have entries with empty textRefs
      if (timingData[indexInTimings].textRef !== '') {
        break;
      }
    }

    if (indexInTimings < 0) return;
    const textRefParts: string[] = timingData[indexInTimings].textRef.split('_');
    const audioTextRef: AudioTextRef | undefined = CheckingUtils.parseAudioRef(textRefParts[0]);
    // return if the text ref is for a heading and not a verse
    if (audioTextRef == null) return;
    if (textRefParts.length > 1) audioTextRef.word = textRefParts[1];
    return audioTextRef;
  }

  /**
   * Finds the current audio heading reference based on the current time.
   * @returns The audio heading reference with the label and iteration if available.
   * Undefined if the current audio timing entry is not a heading.
   */
  static parseAudioHeadingRefByTime(timingData: AudioTiming[], currentTime: number): AudioHeadingRef | undefined {
    const indexInTimings: number = timingData.findIndex(t => t.to > currentTime);
    if (indexInTimings < 0) return;
    const currentAudioTiming: AudioTiming | undefined = timingData[indexInTimings];
    const match: RegExpExecArray | null = AUDIO_HEADING_REF_REGEX.exec(currentAudioTiming.textRef);
    if (match == null) return;
    const ref: string = match[0];
    const label: string = match[1];
    let iterationStr: string = match[2];
    if (iterationStr !== '') return { label, iteration: +iterationStr };

    let iteration: number = timingData.filter(t => t.to <= currentAudioTiming.to && t.textRef === ref).length;
    return { label: match[1], iteration };
  }
}
