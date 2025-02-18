import { TestBed } from '@angular/core/testing';
import { Delta } from 'quill';
import { mock, when } from 'ts-mockito';
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

    it('should return abbrev month and day (like "Jan 5") if timestamp is within the last 26 weeks', () => {
      const now = new Date();
      const timestamp = new Date(now.getTime() - 7 * MILLISECONDS_IN_A_DAY).toISOString(); // 1 week ago
      const result = service.formatTimestamp(timestamp);
      expect(result).toMatch(/[a-z]{3} \d{1,2}/i);
    });

    it('should return mm/dd/yy if timestamp is more than 26 weeks ago', () => {
      const now = new Date();
      const timestamp = new Date(now.getTime() - 7 * MILLISECONDS_IN_A_DAY * 40).toISOString(); // 40 weeks ago
      const result = service.formatTimestamp(timestamp);
      expect(result).toMatch(/\d{1,2}\/\d{1,2}\/\d{2}/);
    });
  });

  describe('processDiff', () => {
    it('should return an empty delta when comparing two equal deltas', () => {
      const deltaA = new Delta().insert('Hello');
      const deltaB = new Delta().insert('Hello');
      const result = service.processDiff(deltaA, deltaB);
      expect(result.ops!.length).toBe(0);
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
