import { TestBed } from '@angular/core/testing';
import { LocalSettingsService } from 'xforge-common/local-settings.service';
import {
  FeedbackNoticeTimingService,
  PRODUCTION_DRAFTING_FEEDBACK_NOTICE_DURATIONS,
  TEST_DRAFTING_FEEDBACK_NOTICE_DURATIONS
} from './feedback-notice-timing.service';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

describe('FeedbackNoticeTimingService', () => {
  it('should use the production drafting durations by default', () => {
    const env = new TestEnvironment();
    expect(env.service.testMode).toBe(false);
    expect(env.service.draftingDurations).toEqual(PRODUCTION_DRAFTING_FEEDBACK_NOTICE_DURATIONS);
  });

  it('should load test mode from local settings', () => {
    const env = new TestEnvironment({ storedTestMode: true });
    expect(env.service.testMode).toBe(true);
    expect(env.service.draftingDurations).toEqual(TEST_DRAFTING_FEEDBACK_NOTICE_DURATIONS);
  });

  it('should store test mode in local settings, and remove it when test mode is turned off', () => {
    const env = new TestEnvironment();
    env.service.testMode = true;
    expect(env.storage.get(TestEnvironment.storageKey)).toBe(true);
    expect(env.service.draftingDurations).toEqual(TEST_DRAFTING_FEEDBACK_NOTICE_DURATIONS);

    env.service.testMode = false;
    expect(env.storage.has(TestEnvironment.storageKey)).toBe(false);
    expect(env.service.draftingDurations).toEqual(PRODUCTION_DRAFTING_FEEDBACK_NOTICE_DURATIONS);
  });

  describe('hasUsedDraftingLongEnough', () => {
    it('should be false when there are no usage dates', () => {
      const env = new TestEnvironment();
      expect(env.service.hasUsedDraftingLongEnough([])).toBe(false);
    });

    it('should compare the span between the earliest and latest dates with the usage duration', () => {
      const env = new TestEnvironment();
      const start = new Date('2025-01-01T00:00:00Z');
      const justShort = new Date(start.getTime() + 90 * DAY_IN_MS - 1);
      const exactly = new Date(start.getTime() + 90 * DAY_IN_MS);
      expect(env.service.hasUsedDraftingLongEnough([justShort.toISOString(), start.toISOString()])).toBe(false);
      expect(env.service.hasUsedDraftingLongEnough([exactly.toISOString(), start.toISOString()])).toBe(true);
    });

    it('should ignore invalid dates', () => {
      const env = new TestEnvironment();
      expect(env.service.hasUsedDraftingLongEnough(['not a date', '2025-01-01', '2025-06-01'])).toBe(true);
      expect(env.service.hasUsedDraftingLongEnough(['not a date'])).toBe(false);
    });

    it('should use the test duration in test mode', () => {
      const env = new TestEnvironment({ storedTestMode: true });
      expect(env.service.hasUsedDraftingLongEnough(['2025-01-01T00:00:00Z', '2025-01-01T00:04:59Z'])).toBe(false);
      expect(env.service.hasUsedDraftingLongEnough(['2025-01-01T00:00:00Z', '2025-01-01T00:05:00Z'])).toBe(true);
    });
  });

  describe('isDraftingNoticeHiddenByRecentResponse', () => {
    it('should be false when the user has neither dismissed the notice nor submitted feedback', () => {
      const env = new TestEnvironment();
      expect(env.service.isDraftingNoticeHiddenByRecentResponse(undefined, undefined)).toBe(false);
    });

    it('should be true only within the dismissal duration after a dismissal', () => {
      const env = new TestEnvironment();
      expect(env.service.isDraftingNoticeHiddenByRecentResponse(daysAgo(179), undefined)).toBe(true);
      expect(env.service.isDraftingNoticeHiddenByRecentResponse(daysAgo(181), undefined)).toBe(false);
    });

    it('should be true only within the submission duration after a submission', () => {
      const env = new TestEnvironment();
      expect(env.service.isDraftingNoticeHiddenByRecentResponse(undefined, daysAgo(364))).toBe(true);
      expect(env.service.isDraftingNoticeHiddenByRecentResponse(undefined, daysAgo(366))).toBe(false);
    });

    it('should ignore an invalid date', () => {
      const env = new TestEnvironment();
      expect(env.service.isDraftingNoticeHiddenByRecentResponse('not a date', 'not a date')).toBe(false);
    });

    it('should use the test durations in test mode', () => {
      const env = new TestEnvironment({ storedTestMode: true });
      expect(env.service.isDraftingNoticeHiddenByRecentResponse(minutesAgo(1), undefined)).toBe(true);
      expect(env.service.isDraftingNoticeHiddenByRecentResponse(minutesAgo(3), undefined)).toBe(false);
      expect(env.service.isDraftingNoticeHiddenByRecentResponse(undefined, minutesAgo(3))).toBe(true);
      expect(env.service.isDraftingNoticeHiddenByRecentResponse(undefined, minutesAgo(5))).toBe(false);
    });
  });
});

function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_IN_MS).toISOString();
}

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

class TestEnvironment {
  static readonly storageKey = 'FEEDBACK_NOTICE_TIMING_TEST_MODE';
  readonly storage = new Map<string, unknown>();
  readonly service: FeedbackNoticeTimingService;

  constructor({ storedTestMode }: { storedTestMode?: boolean } = {}) {
    if (storedTestMode != null) this.storage.set(TestEnvironment.storageKey, storedTestMode);
    const localSettings: Pick<LocalSettingsService, 'get' | 'set' | 'remove'> = {
      get: <T>(key: string) => this.storage.get(key) as T | undefined,
      set: <T>(key: string, value?: T) => {
        if (value == null) this.storage.delete(key);
        else this.storage.set(key, value);
      },
      remove: (key: string) => this.storage.delete(key)
    };
    TestBed.configureTestingModule({ providers: [{ provide: LocalSettingsService, useValue: localSettings }] });
    this.service = TestBed.inject(FeedbackNoticeTimingService);
  }
}
