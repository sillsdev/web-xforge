import { DestroyRef, Injectable } from '@angular/core';
import { Delta } from 'quill';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { TextData } from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import { Chapter, TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { TextInfoPermission } from 'realtime-server/lib/esm/scriptureforge/models/text-info-permission';
import { type } from 'rich-text';
import { Observable, Subject } from 'rxjs';
import { DocSubscriberInfo, DocSubscription } from 'xforge-common/models/realtime-doc';
import { RealtimeService } from 'xforge-common/realtime.service';
import { UserService } from 'xforge-common/user.service';
import { TextDoc, TextDocId, TextDocSource } from './models/text-doc';
import { SFProjectService } from './sf-project.service';

@Injectable({
  providedIn: 'root'
})
export class TextDocService {
  private localSystemTextDocChangesMap = new Map<string, Subject<TextData>>();

  constructor(
    private readonly projectService: SFProjectService,
    private readonly userService: UserService,
    private readonly realtimeService: RealtimeService,
    private readonly destroyRef: DestroyRef
  ) {}

  /**
   * Overwrites the specified text doc with the specified delta and then notifies listeners of the changes.
   * @param {TextDocId} textDocId The id for text doc.
   * @param {Delta} newDelta The ops to overwrite the text doc with.
   * @param {TextDocSource} source The source of the op. This is sent to the server.
   */
  async overwrite(textDocId: TextDocId, newDelta: Delta, source: TextDocSource): Promise<void> {
    const textDoc: TextDoc = await this.projectService.getText(
      textDocId,
      new DocSubscription('TextDocService', this.destroyRef)
    );

    if (textDoc.data?.ops == null) {
      throw new Error(`No TextDoc data for ${textDocId}`);
    }

    const origDelta: Delta = new Delta(textDoc.data.ops);
    const diff: Delta = origDelta.diff(newDelta);

    // Update text doc directly
    await textDoc.submit(diff, source);

    // Notify so that TextViewModels can update
    this.getLocalSystemChangesInternal$(textDocId).next(diff);
  }

  /**
   * Determines if the current user can edit the specified chapter.
   *
   * @param {SFProjectProfile | undefined} project The project.
   * @param {number | undefined} bookNum The book number.
   * @param {number | undefined} chapterNum The chapter number.
   * @returns {boolean} A value indicating whether the chapter can be edited by the current user.
   */
  canEdit(project: SFProjectProfile | undefined, bookNum: number | undefined, chapterNum: number | undefined): boolean {
    return this.isUsfmValid(project, bookNum, chapterNum) && this.canRestore(project, bookNum, chapterNum);
  }

  /**
   * Determines if the current user can restore a previous revision for the specified chapter.
   *
   * @param {SFProjectProfile | undefined} project The project.
   * @param {number | undefined} bookNum The book number.
   * @param {number | undefined} chapterNum The chapter number.
   * @returns {boolean} A value indicating whether the chapter can be edited via history restore by the current user.
   */
  canRestore(
    project: SFProjectProfile | undefined,
    bookNum: number | undefined,
    chapterNum: number | undefined
  ): boolean {
    return (
      this.userHasGeneralEditRight(project) &&
      this.hasChapterEditPermission(project, bookNum, chapterNum) &&
      this.isDataInSync(project) &&
      !this.isEditingDisabled(project)
    );
  }

  async createTextDoc(textDocId: TextDocId, subscriber: DocSubscriberInfo, data?: TextData): Promise<TextDoc> {
    let textDoc: TextDoc = await this.projectService.getText(textDocId, subscriber);

    if (textDoc?.data != null) {
      throw new Error(`Text Doc already exists for ${textDocId}`);
    }

    data ??= { ops: [] };
    textDoc = await this.realtimeService.create(TextDoc.COLLECTION, textDocId.toString(), data, subscriber, type.uri);
    return textDoc;
  }

  /**
   * Determines if the data is in sync for the project.
   *
   * @param {SFProjectProfile | undefined} project The project.
   * @returns {boolean} A value indicating whether the project data is in sync.
   */
  isDataInSync(project: SFProjectProfile | undefined): boolean {
    return project?.sync?.dataInSync !== false;
  }

  /**
   * Determines if editing is disabled for a project.
   *
   * @param {SFProjectProfile | undefined} project The project.
   * @returns {boolean} A value indicating whether editing is disabled for the project.
   */
  isEditingDisabled(project: SFProjectProfile | undefined): boolean {
    return project?.editable === false;
  }

  /**
   * Determines if the USFM is valid for the specified chapter in the project.
   *
   * @param {SFProjectProfile | undefined} project The project.
   * @param {number | undefined} bookNum The book number.
   * @param {number | undefined} chapterNum The chapter number.
   * @returns {boolean} A value indicating whether the USFM is valid.
   *                    If the project or book do not exist, true is returned.
   */
  isUsfmValid(
    project: SFProjectProfile | undefined,
    bookNum: number | undefined,
    chapterNum: number | undefined
  ): boolean {
    const text: TextInfo | undefined = project?.texts.find(t => t.bookNum === bookNum);
    if (text == null) {
      return true;
    }

    return this.isUsfmValidForText(text, chapterNum);
  }

  /**
   * Determines if the USFM is valid for the specified chapter in the text.
   *
   * @param {TextInfo | undefined} text The text representing the book.
   * @param {number | undefined} chapterNum The chapter number.
   * @returns {boolean} A value indicating whether the USFM is valid.
   */
  isUsfmValidForText(text: TextInfo | undefined, chapterNum: number | undefined): boolean {
    const chapter: Chapter | undefined = text?.chapters.find(c => c.number === chapterNum);
    return chapter?.isValid ?? false;
  }

  /**
   * Determines if the current user has permission to edit texts in the project in general.
   *
   * @param {SFProjectProfile | undefined} project The project.
   * @returns {boolean} A value indicating whether the user can edit the project's texts.
   */
  userHasGeneralEditRight(project: SFProjectProfile | undefined): boolean {
    if (project == null) {
      return false;
    }
    return SF_PROJECT_RIGHTS.hasRight(project, this.userService.currentUserId, SFProjectDomain.Texts, Operation.Edit);
  }

  /**
   * Determines if the current user has permission to edit the specified chapter in the project.
   *
   * @param {SFProjectProfile | undefined} project The project.
   * @param {number | undefined} bookNum The book number.
   * @param {number | undefined} chapterNum The chapter number.
   * @returns {boolean} A value indicating whether the user can edit the chapter.
   */
  hasChapterEditPermission(
    project: SFProjectProfile | undefined,
    bookNum: number | undefined,
    chapterNum: number | undefined
  ): boolean {
    const text: TextInfo | undefined = project?.texts.find(t => t.bookNum === bookNum);
    return this.hasChapterEditPermissionForText(text, chapterNum) ?? false;
  }

  /**
   * Determines if the current user has permission to edit the specified chapter in the text.
   *
   * @param {TextInfo | undefined} text  The text representing the book.
   * @param {number | undefined} chapterNum The chapter number.
   * @returns {boolean | undefined} A value indicating whether the user can edit the chapter.
   *                                An undefined value means that the chapter is not in IndexedDB yet.
   */
  hasChapterEditPermissionForText(text: TextInfo | undefined, chapterNum: number | undefined): boolean | undefined {
    const chapter: Chapter | undefined = text?.chapters.find(c => c.number === chapterNum);
    // Even though permissions is guaranteed to be there in the model, its not in IndexedDB the first time the project
    // is accessed after migration
    const permission: string | undefined = chapter?.permissions?.[this.userService.currentUserId];
    return permission == null ? undefined : permission === TextInfoPermission.Write;
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
