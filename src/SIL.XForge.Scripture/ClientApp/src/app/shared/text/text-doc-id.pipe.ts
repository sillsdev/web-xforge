import { Pipe, PipeTransform } from '@angular/core';
import { TextType } from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import { TextDocId } from '../../core/models/text-doc';

@Pipe({
    name: 'textDocId',
    standalone: false
})
export class TextDocIdPipe implements PipeTransform {
  transform(
    projectId: string | undefined,
    bookNum: number | undefined,
    chapter: number | undefined,
    textType: TextType = 'target'
  ): TextDocId | undefined {
    return projectId == null || bookNum == null || chapter == null
      ? undefined
      : new TextDocId(projectId, bookNum, chapter, textType);
  }
}
