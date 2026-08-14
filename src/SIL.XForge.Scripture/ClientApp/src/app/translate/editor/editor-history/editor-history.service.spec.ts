import { TestBed } from '@angular/core/testing';
import { Delta } from 'quill';
import { anything, deepEqual, mock, verify, when } from 'ts-mockito';
import { I18nService } from 'xforge-common/i18n.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { EditorHistoryService } from './editor-history.service';

const MILLISECONDS_IN_A_DAY = 24 * 60 * 60 * 1000;

describe('EditorHistoryService', () => {
  let service: EditorHistoryService;
  const i18nMock = mock(I18nService);

  configureTestingModule(() => ({
    providers: [{ provide: I18nService, useMock: i18nMock }]
  }));

  beforeEach(() => {
    service = TestBed.inject(EditorHistoryService);
    when(i18nMock.locale).thenReturn({ canonicalTag: 'en' } as any);
  });

  it('should remove cid', () => {
    const obj = { cid: '123', subObj: { cid: '456' } };
    service.removeCid(obj);
    expect(obj.cid).toBeUndefined();
    expect(obj.subObj.cid).toBeUndefined();
  });

  it('should remove cid when null values are present', () => {
    const obj = { cid: '123', subObj: null };
    service.removeCid(obj);
    expect(obj.cid).toBeUndefined();
    expect(obj.subObj).toBeNull();
  });

  describe('formatTimestamp', () => {
    it('should return "Invalid Date" if timestamp is null or empty', () => {
      expect(service.formatTimestamp(null)).toBe('Invalid Date');
      expect(service.formatTimestamp('')).toBe('Invalid Date');
    });

    it('should format the date with the I18nService', () => {
      when(i18nMock.formatDate(anything(), anything())).thenReturn('Apr 22, 2026');
      const timestamp = new Date().toISOString();
      expect(service.formatTimestamp(timestamp)).toBe('Apr 22, 2026');
      verify(
        i18nMock.formatDate(deepEqual(new Date(timestamp)), deepEqual({ showTime: false, showTimeZone: false }))
      ).once();
    });

    it('should include the time when requested', () => {
      when(i18nMock.formatDate(anything(), anything())).thenReturn('Apr 22, 2026, 3:04 PM');
      const timestamp = new Date().toISOString();
      expect(service.formatTimestamp(timestamp, true)).toBe('Apr 22, 2026, 3:04 PM');
      verify(
        i18nMock.formatDate(deepEqual(new Date(timestamp)), deepEqual({ showTime: true, showTimeZone: false }))
      ).once();
    });

    it('should use the same format regardless of how old the timestamp is', () => {
      // A project can have revisions spanning several years, so recent and old revisions must be formatted the same
      // way. Formatting recent revisions differently (and without the year) made the dates ambiguous.
      when(i18nMock.formatDate(anything(), anything())).thenReturn('formatted date');
      const recent = new Date(Date.now() - MILLISECONDS_IN_A_DAY).toISOString(); // 1 day ago
      const old = new Date(Date.now() - MILLISECONDS_IN_A_DAY * 700).toISOString(); // almost 2 years ago
      expect(service.formatTimestamp(recent)).toBe('formatted date');
      expect(service.formatTimestamp(old)).toBe('formatted date');
      verify(i18nMock.formatDate(anything(), deepEqual({ showTime: false, showTimeZone: false }))).twice();
    });
  });

  describe('processDiff', () => {
    it('should return an empty delta when comparing two equal deltas', () => {
      const deltaA = new Delta().insert('Hello');
      const deltaB = new Delta().insert('Hello');
      const result = service.processDiff(deltaA, deltaB);
      expect(result.ops.length).toBe(0);
    });

    it('should return the expected diff when comparing two different deltas', () => {
      const deltaA = new Delta().insert('Meow');
      const deltaB = new Delta().insert('Mix');
      const result = service.processDiff(deltaA, deltaB);
      expect(result.ops).toEqual([
        { retain: 1 },
        { attributes: { 'insert-segment': true }, insert: 'ix' },
        { attributes: { 'delete-segment': true }, retain: 3 }
      ]);
    });
  });
});
