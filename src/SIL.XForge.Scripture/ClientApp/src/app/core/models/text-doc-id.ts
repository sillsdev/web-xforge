export type TextType = 'source' | 'target';

export function getTextDocIdStr(
  projectId: string,
  bookId: string,
  chapter: number,
  textType: TextType = 'target'
): string {
  return `${projectId}:${bookId}:${chapter}:${textType}`;
}

export class TextDocId {
  constructor(
    public readonly projectId: string,
    public readonly bookId: string,
    public readonly chapter: number,
    public readonly textType: TextType = 'target'
  ) {}

  toString(): string {
    return getTextDocIdStr(this.projectId, this.bookId, this.chapter, this.textType);
  }
}
