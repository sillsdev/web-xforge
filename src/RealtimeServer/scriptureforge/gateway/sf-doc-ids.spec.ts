import { parseChapterDocId, parseProjectDataId, parseProjectUserConfigId } from './sf-doc-ids';

const PROJECT = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const USER = 'a00000000000000000000001';

describe('sf-doc-ids', () => {
  it('parses project data ids, allowing older simple data ids', () => {
    expect(parseProjectDataId(`${PROJECT}:${USER}`)).toEqual({ projectId: PROJECT, dataId: USER });
    expect(parseProjectDataId(`${PROJECT}:question01`)).toEqual({ projectId: PROJECT, dataId: 'question01' });
  });

  it.each([
    'aaaa',
    `${PROJECT}:`,
    `:${USER}`,
    `${PROJECT}:a:b`,
    `PROJECT:${USER}`,
    `${PROJECT}:a b`,
    `${PROJECT}:${'a'.repeat(65)}`
  ])('refuses %s as a project data id', (docId: string) => {
    expect(parseProjectDataId(docId)).toBeUndefined();
  });

  it('parses project user config ids, whose parts are both hex', () => {
    expect(parseProjectUserConfigId(`${PROJECT}:${USER}`)).toEqual({ projectId: PROJECT, userId: USER });
    expect(parseProjectUserConfigId(`${PROJECT}:user01`)).toBeUndefined();
  });

  it('parses chapter doc ids', () => {
    expect(parseChapterDocId(`${PROJECT}:MAT:1:target`)).toEqual({ projectId: PROJECT, bookNum: 40, chapterNum: 1 });
  });

  it.each([
    `${PROJECT}:MAT:1:source`,
    `${PROJECT}:XYZ:1:target`,
    `${PROJECT}:mat:1:target`,
    `${PROJECT}:MAT:01:target`,
    `${PROJECT}:MAT:-1:target`,
    `${PROJECT}:MAT:1000:target`,
    `${PROJECT}:MAT:1`
  ])('refuses %s as a chapter doc id', (docId: string) => {
    expect(parseChapterDocId(docId)).toBeUndefined();
  });
});
