import { TextDocId } from '../../core/models/text-doc';
import { TextDocIdPipe } from './text-doc-id.pipe';

describe('TextDocIdPipe', () => {
  let pipe: TextDocIdPipe;

  beforeEach(() => {
    pipe = new TextDocIdPipe();
  });

  it('should return undefined when any parameter is undefined', () => {
    expect(pipe.transform(undefined, 1, 1)).toBeUndefined();
    expect(pipe.transform('projectId', undefined, 1)).toBeUndefined();
    expect(pipe.transform('projectId', 1, undefined)).toBeUndefined();
  });

  it('should return a new TextDocId instance when all parameters are defined', () => {
    const projectId = 'projectId';
    const bookNum = 1;
    const chapter = 1;
    const result = pipe.transform(projectId, bookNum, chapter);
    expect(result).toEqual(new TextDocId(projectId, bookNum, chapter));
  });
});
