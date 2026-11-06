import { Injectable } from '@angular/core';
import { LocalSettingsService } from 'xforge-common/local-settings.service';

const MINUTE_IN_MS = 60 * 1000;
const DAY_IN_MS = 24 * 60 * MINUTE_IN_MS;
const testModeKey = 'FEEDBACK_NOTICE_TIMING_TEST_MODE';

/** How long, in milliseconds, each wait of a feedback notice lasts. Each feature that asks for feedback has its own. */
export interface FeedbackNoticeDurations {
  /** How long a user must have been using a feature before the notice asks them for feedback about it. */
  usageBeforeAsking: number;
  /** How long the notice stays hidden after the user dismisses it. */
  hiddenAfterDismissal: number;
  /** How long the notice stays hidden after the user submits feedback. */
  hiddenAfterSubmission: number;
}

export const PRODUCTION_DRAFTING_FEEDBACK_NOTICE_DURATIONS: Readonly<FeedbackNoticeDurations> = {
  usageBeforeAsking: 90 * DAY_IN_MS,
  hiddenAfterDismissal: 180 * DAY_IN_MS,
  hiddenAfterSubmission: 365 * DAY_IN_MS
};

/** Short durations so that testers can see every state of the drafting feedback notice within a few minutes. */
export const TEST_DRAFTING_FEEDBACK_NOTICE_DURATIONS: Readonly<FeedbackNoticeDurations> = {
  usageBeforeAsking: 5 * MINUTE_IN_MS,
  hiddenAfterDismissal: 2 * MINUTE_IN_MS,
  hiddenAfterSubmission: 4 * MINUTE_IN_MS
};

/**
 * Decides when the notices asking the user for feedback about a feature may be shown. Test mode, which is turned on from
 * the diagnostic overlay, swaps the production durations of every feature for short ones. It is stored in local storage, so it only affects the current
 * browser.
 */
@Injectable({ providedIn: 'root' })
export class FeedbackNoticeTimingService {
  private _testMode: boolean;

  constructor(private readonly localSettings: LocalSettingsService) {
    this._testMode = this.localSettings.get<boolean>(testModeKey) === true;
  }

  get testMode(): boolean {
    return this._testMode;
  }

  set testMode(enabled: boolean) {
    this._testMode = enabled;
    if (enabled) this.localSettings.set(testModeKey, true);
    else this.localSettings.remove(testModeKey);
  }

  get draftingDurations(): Readonly<FeedbackNoticeDurations> {
    return this._testMode ? TEST_DRAFTING_FEEDBACK_NOTICE_DURATIONS : PRODUCTION_DRAFTING_FEEDBACK_NOTICE_DURATIONS;
  }

  /**
   * Whether a project has been drafting long enough for the user to be asked for feedback about drafting, judged by how
   * far apart the earliest and latest of the given draft request dates are.
   */
  hasUsedDraftingLongEnough(draftRequestDates: string[]): boolean {
    return this.spansAtLeast(draftRequestDates, this.draftingDurations.usageBeforeAsking);
  }

  /** Whether the drafting feedback notice should stay hidden because the user recently dismissed it or sent feedback. */
  isDraftingNoticeHiddenByRecentResponse(
    dismissalDate: string | undefined,
    submissionDate: string | undefined
  ): boolean {
    return (
      this.isWithin(dismissalDate, this.draftingDurations.hiddenAfterDismissal) ||
      this.isWithin(submissionDate, this.draftingDurations.hiddenAfterSubmission)
    );
  }

  /** Whether the earliest and latest of the given dates are at least the given duration apart. Invalid dates are ignored. */
  private spansAtLeast(isoDates: string[], durationInMs: number): boolean {
    const times: number[] = isoDates.map(d => new Date(d).getTime()).filter(t => !isNaN(t));
    if (times.length === 0) return false;
    return Math.max(...times) - Math.min(...times) >= durationInMs;
  }

  /** Whether less than the given duration has passed since the given date. A missing or invalid date returns false. */
  private isWithin(isoDate: string | undefined, durationInMs: number): boolean {
    if (isoDate == null) return false;
    const time: number = new Date(isoDate).getTime();
    if (isNaN(time)) return false;
    return Date.now() - time < durationInMs;
  }
}
