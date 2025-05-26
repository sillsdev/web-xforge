import { Router } from '@angular/router';
import { Translation, TranslocoService } from '@ngneat/transloco';
import { Canon, VerseRef } from '@sillsdev/scripture';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { DeltaOperation } from 'rich-text';
import { firstValueFrom } from 'rxjs';
import { isObj } from '../../type-utils';
import { SFProjectProfileDoc } from '../core/models/sf-project-profile-doc';
import { roleCanAccessCommunityChecking, roleCanAccessTranslate } from '../core/models/sf-project-role-info';
import { SFProjectUserConfigDoc } from '../core/models/sf-project-user-config-doc';
import { SelectableProject } from '../core/paratext.service';
import { DraftSource } from '../translate/draft-generation/draft-sources.service';

// Regular expression for getting the verse from a segment ref
// Some projects will have the right to left marker in the segment attribute which we need to account for
const VERSE_FROM_SEGMENT_REF_REGEX = /verse_\d+_(\d+[\u200f]?[a-z]?[,-]?\d*[a-z]?[^\/]?)/;
// Regular expression for the verse segment ref of scripture content
export const VERSE_REGEX = /verse_[0-9]+_[0-9]+/;
export const RIGHT_TO_LEFT_MARK = '\u200f';
export const LEFT_TO_RIGHT_EMBEDDING = '\u202A';
export const POP_DIRECTIONAL_FORMATTING = '\u202C';

/**
 * Factory function for APP_INITIALIZER to preload English translations.
 * This ensures that English translations are available before the application fully initializes,
 * which is crucial for interceptors or services that rely on them early in the lifecycle.
 * @param translocoService The Transloco service for loading translations.
 * @returns A function that returns a Promise which resolves when English translations are loaded.
 */
export function preloadEnglishTranslations(translocoService: TranslocoService): () => Promise<Translation> {
  return () => firstValueFrom(translocoService.load('en'));
}

export function combineVerseRefStrs(startStr?: string, endStr?: string): VerseRef | undefined {
  if (!startStr) {
    // no start ref
    return undefined;
  }

  const start = VerseRef.tryParse(startStr);
  if (!start.success) {
    // invalid start ref
    return undefined;
  }

  if (!endStr) {
    // no end ref
    return start.verseRef;
  }

  const end = VerseRef.tryParse(endStr);
  if (!end.success || start.verseRef.BBBCCC !== end.verseRef.BBBCCC) {
    // invalid end ref
    return undefined;
  }

  if (start.verseRef.equals(end.verseRef)) {
    // start and end refs are the same
    return start.verseRef;
  }

  // range
  const rangeStr = `${startStr}-${end.verseRef.verse}`;
  const range = VerseRef.tryParse(rangeStr);
  if (!range.success) {
    return undefined;
  }
  return range.verseRef;
}

/**
 * Returns the base verse of the segment ref. e.g. 'verse_1_5'
 * @return The segment ref of the first segment in the verse, or undefined if the segment does not belong to a verse.
 */
export function getBaseVerse(segmentRef: string): string | undefined {
  const matchArray: RegExpExecArray | null = VERSE_FROM_SEGMENT_REF_REGEX.exec(segmentRef);
  return matchArray == null ? undefined : matchArray[0];
}

/**
 * Gets the digit code for Paratext filenames, such as 01 for GEN, 39 for MAL, and 41 for MAT.
 *
 * These are all 2 digits, except for xxg which is "100":
 * 01...99, 100, A0...A9, B0...B9, C0...C9
 *
 * @param bookNum The book number.
 * @returns The book number file name digits.
 *
 * This is based on ParatextData's ProjectSettings.BookFileNameDigits().
 */
export function getBookFileNameDigits(bookNum: number): string {
  if (bookNum < 10) return '0' + bookNum;
  if (bookNum < 40) return bookNum.toString();
  if (bookNum < 100) return (bookNum + 1).toString();
  if (bookNum < 110) return 'A' + (bookNum - 100);
  if (bookNum < 120) return 'B' + (bookNum - 110);
  return 'C' + (bookNum - 120);
}

/**
 * Get the verses numbers from a verse reference.
 * @returns The verse numbers in the VerseRef as integers.
 * */
export function getVerseNumbers(verseRef: VerseRef): number[] {
  const verseList: number[] = [];
  if (verseRef.verse == null) {
    verseList.push(verseRef.verseNum); // no bridge or segment info included in verse
    return verseList;
  }

  let verseStr = '';
  for (let i = 0; i < verseRef.verse.length; i++) {
    if (verseRef.verse[i].match(/[0-9]/i)) {
      verseStr += verseRef.verse[i];
    } else if (verseStr.length > 0) {
      verseList.push(parseInt(verseStr));
      verseStr = '';
    }
  }

  if (verseStr.length > 0) {
    verseList.push(parseInt(verseStr)); // add any accumulated digits
  }

  return verseList;
}

export function getVerseRefFromSegmentRef(bookNum: number, segmentRef: string): VerseRef | undefined {
  const baseRef: string | undefined = getBaseVerse(segmentRef);
  if (baseRef == null) {
    return undefined;
  }
  const parts = baseRef.split('_');
  return new VerseRef(Canon.bookNumberToId(bookNum), parts[1], parts[2]);
}

/** Returns the verse string from a segment ref. e.g. 6, 6a, 6-7, 6,8 */
export function getVerseStrFromSegmentRef(segmentRef: string): string | undefined {
  const match: RegExpExecArray | null = VERSE_FROM_SEGMENT_REF_REGEX.exec(segmentRef);
  if (match != null) {
    return match[1].replace(RIGHT_TO_LEFT_MARK, '');
  }
  return undefined;
}

export function verseSlug(verse: VerseRef): string {
  return 'verse_' + verse.chapterNum + '_' + (verse.verse == null ? verse.verseNum : verse.verse);
}

export function verseRefFromMouseEvent(event: MouseEvent, bookNum: number): VerseRef | undefined {
  const clickSegment = attributeFromMouseEvent(event, 'USX-SEGMENT', 'data-segment');
  if (clickSegment == null) {
    return undefined;
  }
  const segmentParts = clickSegment.split('_', 3);
  const versePart = segmentParts[2].split('/')[0];
  return new VerseRef(Canon.bookNumberToId(bookNum), segmentParts[1], versePart);
}

export function threadIdFromMouseEvent(event: MouseEvent): string | undefined {
  return attributeFromMouseEvent(event, 'DISPLAY-NOTE', 'data-thread-id');
}

export function attributeFromMouseEvent(event: MouseEvent, nodeName: string, attribute: string): string | undefined {
  // Target is actually a EventTarget but if we treat it as any then we can improve null checks
  let target = event.target as any;
  if (target == null) {
    return undefined;
  }
  if (target?.offsetParent?.nodeName === nodeName) {
    target = target.offsetParent;
  }
  if (target?.parentNode?.nodeName === nodeName) {
    target = target.parentNode;
  }
  if (target?.nodeName === nodeName) {
    return target?.attributes[attribute].value;
  }
  return undefined;
}

export function checkAppAccess(
  projectDoc: SFProjectProfileDoc,
  userId: string,
  projectUserConfigDoc: SFProjectUserConfigDoc,
  pathname: string,
  router: Router
): void {
  if (projectDoc.data == null) return;
  // Remove the record of the selected task so 'Project Home' will not redirect there
  projectUserConfigDoc.submitJson0Op(op => {
    op.unset(puc => puc.selectedTask!);
    op.unset(puc => puc.selectedQuestionRef!);
  });
  const projectRole = projectDoc.data.userRoles[userId] as SFProjectRole;
  const route = '/projects/' + projectDoc.id;

  if (pathname.includes('translate') && !roleCanAccessTranslate(projectRole)) {
    router.navigateByUrl(route, { replaceUrl: true });
    return;
  }
  if (pathname.includes('checking') && !roleCanAccessCommunityChecking(projectRole)) {
    router.navigateByUrl(route, { replaceUrl: true });
  }
}

export function projectLabel(project: SelectableProject | DraftSource | undefined): string {
  if (project == null || (!project.shortName && !project.name)) {
    return '';
  }

  if (!project.shortName) {
    return project.name;
  }
  if (!project.name) {
    return project.shortName;
  }
  return project.shortName + ' - ' + project.name;
}

/**
 * Checks whether a text doc's ops are corrupted. If this function returns false that does not mean the ops are
 * definitely not corrupted, only that they have passed a basic check. It's essentially a linter that runs through
 * several rules to see if any of them are violated.
 * @param ops An array of ops to check.
 */
export function isBadDelta(ops: DeltaOperation[]): boolean {
  const chapterInsertsCount = ops.filter(op => (op?.insert as any)?.chapter != null).length;
  const containsBadOp = ops.some(
    op =>
      // insert must be defined for any op, and can't be nullish
      op.insert == null ||
      // insert needs to be a string, or an object
      ['object', 'string'].includes(typeof op.insert) === false ||
      // insert.verse, if it exists, should be an object, not a boolean like we've seen in the past
      (typeof op.insert === 'object' &&
        'verse' in op.insert &&
        (op.insert.verse == null || typeof op.insert.verse !== 'object')) ||
      // insert.link should not exist
      (isObj(op.insert) && op.insert.link === true) ||
      // the segment identifier should not have null or undefined in it, like we've seen in the past
      (typeof op.attributes?.segment === 'string' && /(?:undefined|null)/.test(op.attributes.segment))
  );
  return chapterInsertsCount > 1 || containsBadOp;
}

export function compareProjectsForSorting(a: { shortName: string }, b: { shortName: string }): 1 | -1 {
  return a.shortName.toLowerCase() < b.shortName.toLowerCase() ? -1 : 1;
}

export function formatFontSizeToRems(fontSize: number | undefined): string | undefined {
  // Paratext allows a font size between 8 and 32. 12pt font is equivalent to 1rem
  return fontSize == null ? undefined : `${fontSize / 12}rem`;
}

export function canInsertNote(project: SFProjectProfile, userId: string): boolean {
  return SF_PROJECT_RIGHTS.hasRight(project, userId, SFProjectDomain.SFNoteThreads, Operation.Create);
}

export function getUnsupportedTags(deltaOp: DeltaOperation): string[] {
  const invalidTags = new Set<string>();

  if (Array.isArray(deltaOp)) {
    deltaOp.forEach(t => getUnsupportedTags(t).forEach(s => invalidTags.add(s)));
  } else if (deltaOp && typeof deltaOp === 'object') {
    if (deltaOp.attributes?.['invalid-block'] !== undefined || deltaOp.attributes?.['invalid-inline'] !== undefined) {
      let style = (deltaOp.attributes?.char as any)?.style;
      if (style !== undefined) {
        invalidTags.add(style);
      } else {
        style = (deltaOp.attributes?.para as any)?.style;
        if (style !== undefined) {
          invalidTags.add(style);
        }
      }
    }

    Object.values(deltaOp).forEach(v => getUnsupportedTags(v as any).forEach(s => invalidTags.add(s)));
  }

  return [...invalidTags];
}

export function booksFromScriptureRange(scriptureRange: string): number[] {
  if (scriptureRange === '') return [];
  return scriptureRange.split(';').map(book => Canon.bookIdToNumber(book));
}

export class XmlUtils {
  /** Encode text to be valid xml text node. Escape reserved xml characters such as & and < >. */
  static encodeForXml(text: string): string {
    const xmlDoc: XMLDocument = document.implementation.createDocument(null, 'root');
    xmlDoc.documentElement.textContent = text;
    return xmlDoc.documentElement.innerHTML;
  }

  /** Decode xml text node to plain text. */
  static decodeFromXml(xml: string): string {
    const xmlDoc: XMLDocument = document.implementation.createDocument(null, 'root');
    xmlDoc.documentElement.innerHTML = xml;
    return xmlDoc.documentElement.textContent!;
  }

  /** Convert xml note content to html to display in the browser. */
  static convertXmlToHtml(xml: string): string {
    const xmlDoc: XMLDocument = document.implementation.createDocument(null, 'root');
    xmlDoc.documentElement.innerHTML = xml;
    const treeWalker: TreeWalker = xmlDoc.createTreeWalker(xmlDoc.documentElement);
    let htmlString = '';
    const nodeTypes: number[] = [Node.ELEMENT_NODE, Node.TEXT_NODE];
    while (treeWalker.nextNode() != null) {
      if (nodeTypes.includes(treeWalker.currentNode.nodeType)) {
        htmlString += this.processNode(treeWalker);
      }
    }
    return htmlString;
  }

  /** Get the html contents of the current node and siblings. */
  private static processNodeAndSiblings(treeWalker: TreeWalker): string {
    if (treeWalker.currentNode.nextSibling == null) {
      return this.processNode(treeWalker);
    }
    let htmlString = '';
    while (treeWalker.currentNode.nextSibling != null) {
      htmlString += this.processNode(treeWalker);
      // move to the next sibling node
      treeWalker.nextNode();
    }
    htmlString += this.processNode(treeWalker);
    return htmlString;
  }

  private static processNode(treeWalker: TreeWalker): string {
    switch (treeWalker.currentNode.nodeName.toLowerCase()) {
      case 'p':
        if (!treeWalker.currentNode.hasChildNodes()) return '';
        treeWalker.nextNode();
        return this.processNodeAndSiblings(treeWalker) + '<br />';
      case 'bold':
        if (!treeWalker.currentNode.hasChildNodes()) return '';
        treeWalker.nextNode();
        return '<b>' + this.processNodeAndSiblings(treeWalker) + '</b>';
      case 'italic':
        if (!treeWalker.currentNode.hasChildNodes()) return '';
        treeWalker.nextNode();
        return '<i>' + this.processNodeAndSiblings(treeWalker) + '</i>';
      case 'span':
        if (!treeWalker.currentNode.hasChildNodes()) return '';
        treeWalker.nextNode();
        return '<span>' + this.processNodeAndSiblings(treeWalker) + '</span>';
      case '#text':
        // get the inner html of the span element to get the encoded text so that < and > symbols are
        // not lost during html sanitation
        const span = document.createElement('span');
        span.textContent = treeWalker.currentNode.nodeValue;
        return span.innerHTML;
      default:
        // the node is for a tag we do not recognize. Show just the text content.
        if (!treeWalker.currentNode.hasChildNodes()) return '';
        treeWalker.nextNode();
        return this.processNodeAndSiblings(treeWalker);
    }
  }
}

/**
 * A non-exhaustive list of icons that should be mirrored in RTL languages.
 * Some icons (as as arrows) should be mirrored in certain contexts and not others, or require more attention to detail
 * than merely mirroring. This list is ONLY for those icons that can be mirrored in all contexts.
 */
export const ICONS_TO_MIRROR_RTL = new Set<string | undefined>([
  'bar_chart',
  'book',
  'bookmarks',
  'comment',
  'forum',
  'help',
  'library_books',
  'list',
  'live_help',
  'auto_awesome',
  'people',
  'person_add',
  'post_add',
  'question_answer'
]);
