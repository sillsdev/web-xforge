import { Delta } from 'quill';
import { ParatextUserProfile } from 'realtime-server/lib/esm/scriptureforge/models/paratext-user-profile';
import { isParatextRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { TextData } from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import { TextDocId } from '../core/models/text-doc';
import { RIGHT_TO_LEFT_MARK } from './utils';

/* USFM:
\s Title for chapter 1
\c 1
\p
\v 1 target: chapter 1, verse 1.
\v 2
\v 3 target: chapter 1, verse 3.
\v 4 target: chapter 1, verse 4.
\p
\v 5 target: chapter 1,
\p
\v 6 target: chapter 1, verse 6.
\p
\v 7 target: chapter 1, verse 7.
\p target: chapter 1, verse 7 - 2nd paragraph.
*/
export function getTextDoc(id: TextDocId, modelHasBlanks: boolean = false): TextData {
  const delta = new Delta();
  delta.insert(`Title for chapter ${id.chapterNum}`, { segment: 's_1' });
  delta.insert('\n', { para: { style: 's' } });
  delta.insert({ chapter: { number: id.chapterNum.toString(), style: 'c' } });
  if (modelHasBlanks) delta.insert({ blank: true }, { segment: 'p_1' });
  delta.insert({ verse: { number: '1', style: 'v' } });
  delta.insert(`${id.textType}: chapter ${id.chapterNum}, verse 1.`, { segment: `verse_${id.chapterNum}_1` });
  delta.insert({ verse: { number: '2', style: 'v' } });
  if (modelHasBlanks) delta.insert({ blank: true }, { segment: `verse_${id.chapterNum}_2` });
  delta.insert({ verse: { number: '3', style: 'v' } });
  delta.insert(`${id.textType}: chapter ${id.chapterNum}, verse 3.`, { segment: `verse_${id.chapterNum}_3` });
  delta.insert({ verse: { number: '4', style: 'v' } });
  delta.insert(`${id.textType}: chapter ${id.chapterNum}, verse 4.`, { segment: `verse_${id.chapterNum}_4` });
  delta.insert('\n', { para: { style: 'p' } });
  if (modelHasBlanks) delta.insert({ blank: true }, { segment: `verse_${id.chapterNum}_4/p_1` });
  delta.insert({ verse: { number: '5', style: 'v' } });
  delta.insert(`${id.textType}: chapter ${id.chapterNum}, `, { segment: `verse_${id.chapterNum}_5` });
  delta.insert('\n', { para: { style: 'p' } });
  if (modelHasBlanks) delta.insert({ blank: true }, { segment: `verse_${id.chapterNum}_5/p_1` });
  delta.insert({ verse: { number: '6', style: 'v' } });
  delta.insert(`${id.textType}: chapter ${id.chapterNum}, verse 6. `, { segment: `verse_${id.chapterNum}_6` });
  delta.insert('\n', { para: { style: 'p' } });
  if (modelHasBlanks) delta.insert({ blank: true }, { segment: `verse_${id.chapterNum}_6/p_1` });
  delta.insert({ verse: { number: '7', style: 'v' } });
  delta.insert(`${id.textType}: chapter ${id.chapterNum}, verse 7.`, { segment: `verse_${id.chapterNum}_7` });
  delta.insert('\n', { para: { style: 'p' } });
  delta.insert(`${id.textType}: chapter ${id.chapterNum}, verse 7 - 2nd paragraph.`, {
    segment: `verse_${id.chapterNum}_7/p_1`
  });
  delta.insert('\n', { para: { style: 'p' } });
  return delta;
}

/* USFM
\s Title for chapter 1
\c 1
\p
\v 1 target: chapter 1, verse 1.
\v 2-3 target: chapter 1, verse 2-3.
\s Text in section heading
\p
\v 4 target: chapter 1, verse 4.
\v 5,7 target: chapter 1, verse 5,7.
\v 6a target: chapter 1, verse 6a.
\v 6b target: chapter 1, verse 6b.
*/
export function getCombinedVerseTextDoc(
  id: TextDocId,
  modelHasBlanks: boolean = false,
  rtl: boolean = false
): TextData {
  const verse2Str: string = rtl ? `2${RIGHT_TO_LEFT_MARK}-3` : '2-3';
  const verse5Str: string = rtl ? `5${RIGHT_TO_LEFT_MARK},7` : '5,7';
  const delta = new Delta();
  delta.insert(`Title for chapter ${id.chapterNum}`, { segment: 's_1' });
  delta.insert('\n', { para: { style: 's' } });
  delta.insert({ chapter: { number: id.chapterNum.toString(), style: 'c' } });
  if (modelHasBlanks) delta.insert({ blank: true }, { segment: 'p_1' });
  delta.insert({ verse: { number: '1', style: 'v' } });
  delta.insert(`${id.textType}: chapter ${id.chapterNum}, verse 1.`, { segment: `verse_${id.chapterNum}_1` });
  delta.insert({ verse: { number: verse2Str, style: 'v' } });
  delta.insert(`${id.textType}: chapter ${id.chapterNum}, verse 2-3.`, {
    segment: `verse_${id.chapterNum}_${verse2Str}`
  });
  delta.insert('\n', { para: { style: 'p' } });
  delta.insert('Text in section heading', { segment: 's_2' });
  delta.insert('\n', { para: { style: 's' } });
  if (modelHasBlanks) delta.insert({ blank: true }, { segment: 'p_2' });
  delta.insert({ verse: { number: '4', style: 'v' } });
  delta.insert(`${id.textType}: chapter ${id.chapterNum}, verse 4.`, { segment: `verse_${id.chapterNum}_4` });
  delta.insert({ verse: { number: verse5Str, style: 'v' } });
  delta.insert(`${id.textType}: chapter ${id.chapterNum}, verse 5,7.`, {
    segment: `verse_${id.chapterNum}_${verse5Str}`
  });
  delta.insert({ verse: { number: '6a', style: 'v' } });
  delta.insert(`${id.textType}: chapter ${id.chapterNum}, verse 6a.`, { segment: `verse_${id.chapterNum}_6a` });
  delta.insert({ verse: { number: '6b', style: 'v' } });
  delta.insert(`${id.textType}: chapter ${id.chapterNum}, verse 6b.`, { segment: `verse_${id.chapterNum}_6b` });
  delta.insert('\n', { para: { style: 'p' } });
  return delta;
}

/* USFM:
\s Title for chapter 1
\c 1
\q
\v 1 Poetry first line
\q Poetry second line
\b
\q Poetry third line
\q Poetry fourth line
*/
export function getPoetryVerseTextDoc(id: TextDocId, modelHasBlanks: boolean = false): TextData {
  const delta = new Delta();
  delta.insert(`Title for chapter ${id.chapterNum}`, { segment: 's_1' });
  delta.insert('\n', { para: { style: 's' } });
  delta.insert({ chapter: { number: id.chapterNum.toString(), style: 'c' } });
  if (modelHasBlanks) delta.insert({ blank: true }, { segment: 'q_1' });
  delta.insert({ verse: { number: '1', style: 'v' } });
  delta.insert('Poetry first line', { segment: `verse_${id.chapterNum}_1` });
  delta.insert('\n', { para: { style: 'q' } });
  delta.insert('Poetry second line', { segment: `verse_${id.chapterNum}_1/q_1` });
  delta.insert('\n', { para: { style: 'q' } });
  if (modelHasBlanks) delta.insert({ blank: true }, { segment: `verse_${id.chapterNum}_1/b_2` });
  delta.insert('\n', { para: { style: 'b' } });
  delta.insert('Poetry third line', { segment: `verse_${id.chapterNum}_1/q_3` });
  delta.insert('\n', { para: { style: 'q' } });
  delta.insert('Poetry fourth line.', { segment: `verse_${id.chapterNum}_1/q_4` });
  delta.insert('\n', { para: { style: 'q' } });
  return delta;
}

/* USFM:
\s
\c 1
\s
\p
\v 1
\v 2
\s
\p
\v 3
*/
export function getEmptyChapterDoc(id: TextDocId, modelHasBlanks: boolean): TextData {
  const delta = new Delta();
  if (modelHasBlanks) delta.insert({ blank: true }, { segment: 's_1' });
  delta.insert('\n', { para: { style: 's' } });
  delta.insert({ chapter: { number: id.chapterNum.toString(), style: 'c' } });
  if (modelHasBlanks) delta.insert({ blank: true }, { segment: 's_2' });
  delta.insert('\n', { para: { style: 's' } });
  if (modelHasBlanks) delta.insert({ blank: true }, { segment: 'p_1' });
  delta.insert({ verse: { number: '1', style: 'v' } });
  if (modelHasBlanks) delta.insert({ blank: true }, { segment: 'verse_1_1' });
  delta.insert({ verse: { number: '2', style: 'v' } });
  if (modelHasBlanks) delta.insert({ blank: true }, { segment: 'verse_1_2' });
  delta.insert('\n', { para: { style: 'p' } });
  if (modelHasBlanks) delta.insert({ blank: true }, { segment: 's_3' });
  delta.insert('\n', { para: { style: 's' } });
  if (modelHasBlanks) delta.insert({ blank: true }, { segment: 'p_2' });
  delta.insert({ verse: { number: '3', style: 'v' } });
  if (modelHasBlanks) delta.insert({ blank: true }, { segment: 'verse_1_3' });
  delta.insert('\n\n', { para: { style: 'p' } });
  return delta;
}

export function paratextUsersFromRoles(userRoles: { [id: string]: string }): ParatextUserProfile[] {
  return Object.keys(userRoles)
    .filter(u => isParatextRole(userRoles[u]))
    .map(u => ({ sfUserId: u, username: `pt${u}`, opaqueUserId: `opaque${u}` }));
}

// Function to create a mock MediaStream with an audio track
export const createMockMediaStream = (): MediaStream => {
  // Use the MediaStream constructor to simulate a stream with an audio track
  const audioContext: AudioContext = new window.AudioContext();
  const oscillator: OscillatorNode = audioContext.createOscillator();
  const destination: MediaStreamAudioDestinationNode = audioContext.createMediaStreamDestination();

  oscillator.connect(destination);
  oscillator.start();

  return destination.stream;
};
