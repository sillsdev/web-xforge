import { VerseRef } from '@sillsdev/scripture';
import { SFProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { DeltaOperation } from 'rich-text';
import { SelectableProject } from '../core/paratext.service';
import {
  compareProjectsForSorting,
  getBookFileNameDigits,
  getUnsupportedTags,
  getVerseNumbers,
  isBadDelta,
  projectLabel,
  XmlUtils
} from './utils';

describe('shared utils', () => {
  describe('projectLabel function', () => {
    const shortName = 'SN';
    const name = 'Name';

    it('should use nothing if project is undefined', () => {
      const label = projectLabel(undefined);
      expect(label).toEqual('');
    });

    it('should use nothing if project has no name or shortName', () => {
      const label = projectLabel({} as SelectableProject);
      expect(label).toEqual('');
    });

    it('should use shortName only if project has no name', () => {
      const label = projectLabel({ shortName } as SelectableProject);
      expect(label).toEqual(shortName);
    });

    it('should use name only if project has no shortName', () => {
      const label = projectLabel({ name } as SelectableProject);
      expect(label).toEqual(name);
    });

    it('should use both if project has both', () => {
      const label = projectLabel({ name, shortName } as SelectableProject);
      expect(label).toEqual(shortName + ' - ' + name);
    });
  });

  describe('isBadDelta function', () => {
    it('requires op.insert to be a string or object', () => {
      expect(isBadDelta([{}])).toBeTrue();
      expect(isBadDelta([{ insert: null }])).toBeTrue();
      expect(isBadDelta([{ insert: 1 as any }])).toBeTrue();
      // this isn't actually a good op, but isBadDelta won't see a problem with it
      // it's looking for known issues, not proving validity
      expect(isBadDelta([{ insert: {} }])).toBeFalse();
    });

    it('requires that there be an insert', () => {
      expect(isBadDelta([{ thisIsNotAnInsert: 1 } as DeltaOperation])).toBeTrue();
    });

    it('rejects delete and retain ops', () => {
      expect(isBadDelta([{ insert: 'text' }, { delete: 100 }])).toBeTrue();
      expect(isBadDelta([{ insert: 'text' }, { retain: 1 }])).toBeTrue();
      expect(isBadDelta([{ insert: 'text' }, { delete: 100 }, { retain: 1 }])).toBeTrue();
    });

    it('does not allow op.insert.verse to be a non object', () => {
      // op.insert.verse does not have to exist
      expect(isBadDelta([{ insert: {} }])).toBeFalse();
      // but if it does, it has to be an object
      expect(isBadDelta([{ insert: { verse: true } }])).toBeTrue();
      expect(isBadDelta([{ insert: { verse: { number: '2', style: 'v' } } }])).toBeFalse();
    });

    it('requires attributes.segment to not contain null or undefined', () => {
      expect(isBadDelta([{ insert: 'text', attributes: { segment: 'verse_1_1' } }])).toBeFalse();
      expect(isBadDelta([{ insert: 'text', attributes: { segment: 'verse_1_null' } }])).toBeTrue();
      expect(isBadDelta([{ insert: 'text', attributes: { segment: 'verse_1_undefined' } }])).toBeTrue();
    });

    it('does not allow multiple chapter inserts', () => {
      const chapterInsert = { insert: { chapter: { number: '1', style: 'c' } } };
      expect(isBadDelta([])).toBeFalse();
      expect(isBadDelta([chapterInsert])).toBeFalse();
      expect(isBadDelta([chapterInsert, chapterInsert])).toBeTrue();
    });
  });

  it('compares projects for sorting', () => {
    const projects = [{ shortName: 'bbb' }, { shortName: 'CCC' }, { shortName: 'AAA' }] as SFProject[];
    projects.sort(compareProjectsForSorting);
    expect(projects.map(project => project.shortName)).toEqual(['AAA', 'bbb', 'CCC']);
  });

  describe('Xml Utils', () => {
    it('should convert plain text to xml', () => {
      expect(XmlUtils.encodeForXml('')).toEqual('');
      expect(XmlUtils.encodeForXml('string without formatting')).toEqual('string without formatting');
      expect(XmlUtils.encodeForXml('string with & and <symbols>.')).toEqual('string with &amp; and &lt;symbols&gt;.');
      expect(XmlUtils.encodeForXml('content in paragraph.\nsecond paragraph')).toEqual(
        'content in paragraph.\nsecond paragraph'
      );
    });

    it('should decode from xml to plain text', () => {
      expect(XmlUtils.decodeFromXml('')).toEqual('');
      expect(XmlUtils.decodeFromXml('string without formatting')).toEqual('string without formatting');
      expect(XmlUtils.decodeFromXml('string with &amp; and &lt;symbols&gt;.')).toEqual('string with & and <symbols>.');
      expect(XmlUtils.decodeFromXml('content in paragraph.\nsecond paragraph')).toEqual(
        'content in paragraph.\nsecond paragraph'
      );
      // we do not expect to decode xml tags since Paratext notes will not be editable. Just show the text content
      expect(XmlUtils.decodeFromXml('<p>content in paragraph.</p><p>second paragraph</p>')).toEqual(
        'content in paragraph.second paragraph'
      );

      // malformed xml
      expect(() => XmlUtils.decodeFromXml('<p')).toThrow();
      expect(() => XmlUtils.decodeFromXml('<p>')).toThrow();
    });

    it('should convert xml to html', () => {
      expect(XmlUtils.convertXmlToHtml('')).toEqual('');
      expect(XmlUtils.convertXmlToHtml('string without formatting')).toEqual('string without formatting');
      expect(XmlUtils.convertXmlToHtml('<p>Here is text</p>')).toEqual('Here is text<br />');
      expect(XmlUtils.convertXmlToHtml('<p>Here is text</p><p>Second paragraph text</p>')).toEqual(
        'Here is text<br />Second paragraph text<br />'
      );
      expect(XmlUtils.convertXmlToHtml('<bold>Here is text</bold>')).toEqual('<b>Here is text</b>');
      expect(XmlUtils.convertXmlToHtml('<italic>Here is text</italic>')).toEqual('<i>Here is text</i>');
      expect(XmlUtils.convertXmlToHtml('<p>Text with <bold>bold</bold> and <italic>italic</italic></p>')).toEqual(
        'Text with <b>bold</b> and <i>italic</i><br />'
      );
      expect(XmlUtils.convertXmlToHtml('<p>Paragraph with <bold><italic>nested</italic> styles</bold></p>')).toEqual(
        'Paragraph with <b><i>nested</i> styles</b><br />'
      );
      expect(XmlUtils.convertXmlToHtml('<p>Paragraph with <bold></bold>empty bold tag</p>')).toEqual(
        'Paragraph with empty bold tag<br />'
      );
      expect(XmlUtils.convertXmlToHtml('<p>Text in <span>span</span> tag</p>')).toEqual(
        'Text in <span>span</span> tag<br />'
      );
      expect(XmlUtils.convertXmlToHtml('<p>\nNode with whitespace\n</p>')).toEqual('\nNode with whitespace\n<br />');
      expect(XmlUtils.convertXmlToHtml('Alpha <unknown><bold>Bravo</bold></unknown> Charlie')).toEqual(
        'Alpha <b>Bravo</b> Charlie'
      );
      expect(XmlUtils.convertXmlToHtml('check <unknown id="anything">unknown</unknown> <italic>text</italic>')).toEqual(
        'check unknown <i>text</i>'
      );
    });
  });

  describe('getVerseNumbers function', () => {
    it('gets the verse number from a single verse number', () => {
      expect(getVerseNumbers(new VerseRef(1, 2, 3))).toEqual([3]);
    });
    it('gets the verse number from a single verse string', () => {
      expect(getVerseNumbers(new VerseRef('GEN 2:3'))).toEqual([3]);
    });
    it('gets the verse number from a partial verse reference', () => {
      expect(getVerseNumbers(new VerseRef('GEN', '2', '3a'))).toEqual([3]);
    });
    it('gets the verse number from a verse range', () => {
      expect(getVerseNumbers(new VerseRef('GEN', '2', '3,4-6'))).toEqual([3, 4, 6]);
    });
  });

  describe('getBookFileNameDigits function', () => {
    it('pads a number less than 10 with 0', () => {
      expect(getBookFileNameDigits(1)).toEqual('01');
      expect(getBookFileNameDigits(9)).toEqual('09');
    });
    it('does not pad a number between 10 and 39', () => {
      expect(getBookFileNameDigits(10)).toEqual('10');
      expect(getBookFileNameDigits(39)).toEqual('39');
    });
    it('returns number plus one for numbers between 40 and 99', () => {
      expect(getBookFileNameDigits(40)).toEqual('41');
      expect(getBookFileNameDigits(99)).toEqual('100');
    });
    it('returns A and the ones place value for numbers between 100 and 109', () => {
      expect(getBookFileNameDigits(100)).toEqual('A0');
      expect(getBookFileNameDigits(109)).toEqual('A9');
    });
    it('returns B and the ones place value for numbers between 110 and 119', () => {
      expect(getBookFileNameDigits(110)).toEqual('B0');
      expect(getBookFileNameDigits(119)).toEqual('B9');
    });
    it('returns C and the ones place value for numbers between 120 and 129', () => {
      expect(getBookFileNameDigits(120)).toEqual('C0');
      expect(getBookFileNameDigits(129)).toEqual('C9');
    });
  });

  describe('getUnsupportedTags', () => {
    it('valid returns empty', () => {
      expect(getUnsupportedTags({ insert: 'some text' })).toEqual([]);
    });

    it('can find invalid-block char style', () => {
      expect(getUnsupportedTags({ attributes: { 'invalid-block': true, char: { style: 'bad' } } })).toEqual(['bad']);
    });

    it('can find invalid-block para style', () => {
      expect(getUnsupportedTags({ attributes: { 'invalid-block': true, para: { style: 'bad' } } })).toEqual(['bad']);
    });

    it('can find invalid-line', () => {
      expect(getUnsupportedTags({ attributes: { 'invalid-inline': true, char: { style: 'bad' } } })).toEqual(['bad']);
    });

    it('can find nested invalid content', () => {
      expect(
        getUnsupportedTags({
          attributes: { segment: 'verse_1' },
          insert: { note: { contents: { ops: [{ attributes: { 'invalid-inline': true, char: { style: 'bad' } } }] } } }
        })
      ).toEqual(['bad']);
    });

    it('can find multiple tags', () => {
      expect(
        getUnsupportedTags({
          attributes: { segment: 'verse_1', 'invalid-block': true, char: { style: 'bad2' } },
          insert: { note: { contents: { ops: [{ attributes: { 'invalid-inline': true, char: { style: 'bad' } } }] } } }
        })
      ).toEqual(['bad2', 'bad']);
    });

    it('does not return duplicates', () => {
      expect(
        getUnsupportedTags({
          attributes: { segment: 'verse_1', 'invalid-block': true, char: { style: 'bad' } },
          insert: { note: { contents: { ops: [{ attributes: { 'invalid-inline': true, char: { style: 'bad' } } }] } } }
        })
      ).toEqual(['bad']);
    });
  });
});
