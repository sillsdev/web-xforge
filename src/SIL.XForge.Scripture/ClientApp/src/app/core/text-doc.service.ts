import { Injectable } from '@angular/core';
import { DeltaStatic } from 'quill';
import { TextData } from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import { Delta } from 'rich-text';
import { Observable, Subject } from 'rxjs';
import { TextDoc, TextDocId } from './models/text-doc';
import { SFProjectService } from './sf-project.service';

@Injectable({
  providedIn: 'root'
})
export class TextDocService {
  private localSystemTextDocChangesMap = new Map<string, Subject<TextData>>();

  constructor(private readonly projectService: SFProjectService) {}

  /**
   * Overwrites the specified text doc with the specified delta and then notifies listeners of the changes.
   * @param {TextDocId} textDocId The id for text doc.
   * @param {DeltaStatic} newDelta The ops to overwrite the text doc with.
   */
  async overwrite(textDocId: TextDocId, newDelta: DeltaStatic): Promise<void> {
    const textDoc: TextDoc = await this.projectService.getText(textDocId);

    if (textDoc.data?.ops == null) {
      throw new Error(`No TextDoc data for ${textDocId}`);
    }

    const origDelta: DeltaStatic = new Delta(textDoc.data.ops);
    const diff: DeltaStatic = origDelta.diff(newDelta);

    // Update text doc directly
    await textDoc.submit(diff);

    // Notify so that TextViewModels can update
    this.getLocalSystemChangesInternal$(textDocId).next(diff);
  }

  /**
   * Gets an observable that emits the diff when the local system has made changes to the specified text doc.
   *
   * This is useful for updating the editor to reflect changes that are not made by user edits,
   * such as when a draft or history revision is applied.
   * @param {TextDocId} textDocId The id for text doc to listen to.
   * @returns {Observable<TextData>} An observable that emits the diff ops.
   */
  getLocalSystemChanges$(textDocId: TextDocId): Observable<TextData> {
    return this.getLocalSystemChangesInternal$(textDocId).asObservable();
  }

  private getLocalSystemChangesInternal$(textDocId: TextDocId): Subject<TextData> {
    const key: string = textDocId.toString();
    let subject: Subject<TextData> | undefined = this.localSystemTextDocChangesMap.get(key);

    if (subject == null) {
      subject = new Subject<TextData>();
      this.localSystemTextDocChangesMap.set(key, subject);
    }

    return subject;
  }
}
