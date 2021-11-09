import { CheckingShareLevel } from 'realtime-server/lib/esm/scriptureforge/models/checking-config';
import { SFProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { TextData } from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import { TranslateShareLevel } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { Delta, TextDocId } from '../core/models/text-doc';

export function getTextDoc(id: TextDocId): TextData {
  const delta = new Delta();
  delta.insert(`Title for chapter ${id.chapterNum}`, { segment: 's_1' });
  delta.insert('\n', { para: { style: 's' } });
  delta.insert({ chapter: { number: id.chapterNum.toString(), style: 'c' } });
  delta.insert({ blank: true }, { segment: 'p_1' });
  delta.insert({ verse: { number: '1', style: 'v' } });
  delta.insert(`${id.textType}: chapter ${id.chapterNum}, verse 1.`, { segment: `verse_${id.chapterNum}_1` });
  delta.insert({ verse: { number: '2', style: 'v' } });
  delta.insert({ blank: true }, { segment: `verse_${id.chapterNum}_2` });
  delta.insert({ verse: { number: '3', style: 'v' } });
  delta.insert(`${id.textType}: chapter ${id.chapterNum}, verse 3.`, { segment: `verse_${id.chapterNum}_3` });
  delta.insert({ verse: { number: '4', style: 'v' } });
  delta.insert(`${id.textType}: chapter ${id.chapterNum}, verse 4.`, { segment: `verse_${id.chapterNum}_4` });
  delta.insert('\n', { para: { style: 'p' } });
  delta.insert({ blank: true }, { segment: `verse_${id.chapterNum}_4/p_1` });
  delta.insert({ verse: { number: '5', style: 'v' } });
  delta.insert(`${id.textType}: chapter ${id.chapterNum}, `, { segment: `verse_${id.chapterNum}_5` });
  delta.insert('\n', { para: { style: 'p' } });
  delta.insert({ blank: true }, { segment: `verse_${id.chapterNum}_5/p_1` });
  delta.insert({ verse: { number: '6', style: 'v' } });
  delta.insert(`${id.textType}: chapter ${id.chapterNum}, verse 6. `, { segment: `verse_${id.chapterNum}_6` });
  delta.insert('\n', { para: { style: 'p' } });
  return delta;
}

export function getCombinedVerseTextDoc(id: TextDocId): TextData {
  const delta = new Delta();
  delta.insert(`Title for chapter ${id.chapterNum}`, { segment: 's_1' });
  delta.insert('\n', { para: { style: 's' } });
  delta.insert({ chapter: { number: id.chapterNum.toString(), style: 'c' } });
  delta.insert({ blank: true }, { segment: 'p_1' });
  delta.insert({ verse: { number: '1', style: 'v' } });
  delta.insert(`${id.textType}: chapter ${id.chapterNum}, verse 1.`, { segment: `verse_${id.chapterNum}_1` });
  delta.insert({ verse: { number: '2-3', style: 'v' } });
  delta.insert(`${id.textType}: chapter ${id.chapterNum}, verse 2-3.`, { segment: `verse_${id.chapterNum}_2-3` });
  delta.insert('\n', { para: { style: 'p' } });
  return delta;
}

export function getSFProject(id: string): SFProject {
  return {
    name: `${id} name`,
    paratextId: `${id}_target`,
    shortName: 'TRG',
    userRoles: { user01: SFProjectRole.ParatextTranslator, user02: SFProjectRole.ParatextConsultant },
    userPermissions: {},
    writingSystem: { tag: 'qaa' },
    translateConfig: {
      translationSuggestionsEnabled: false,
      shareEnabled: false,
      shareLevel: TranslateShareLevel.Specific
    },
    checkingConfig: {
      checkingEnabled: false,
      usersSeeEachOthersResponses: true,
      shareEnabled: true,
      shareLevel: CheckingShareLevel.Specific
    },
    sync: { queuedCount: 0 },
    texts: [
      {
        bookNum: 40,
        chapters: [
          { number: 1, lastVerse: 3, isValid: true, permissions: {} },
          { number: 2, lastVerse: 3, isValid: true, permissions: {} }
        ],
        hasSource: true,
        permissions: {}
      }
    ]
  };
}
