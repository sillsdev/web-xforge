import { Connection, Doc } from 'sharedb/lib/client';
import { createFetchQuery, docSubmitJson0Op } from '../../common/utils/sharedb-utils';
import { OwnedData } from '../../common/models/owned-data';
import { ProjectDomainConfig } from '../../common/services/project-data-service';
import { ANY_INDEX } from '../../common/utils/obj-path';
import {
  NoteThread,
  NOTE_THREAD_COLLECTION,
  NOTE_THREAD_INDEX_PATHS,
  SF_NOTE_THREAD_PREFIX
} from '../models/note-thread';
import { SFProjectDomain, SF_PROJECT_RIGHTS } from '../models/sf-project-rights';
import { SFProjectUserConfig, SF_PROJECT_USER_CONFIGS_COLLECTION } from '../models/sf-project-user-config';
import { Note } from '../models/note';
import { Project } from '../../common/models/project';
import { ConnectSession } from '../../common/connect-session';
import { Operation } from '../../common/models/project-rights';
import { NOTE_THREAD_MIGRATIONS } from './note-thread-migrations';
import { SFProjectDataService } from './sf-project-data-service';

export class NoteThreadService extends SFProjectDataService<NoteThread> {
  readonly collection = NOTE_THREAD_COLLECTION;

  protected readonly indexPaths = NOTE_THREAD_INDEX_PATHS;
  protected readonly listenForUpdates = true;

  constructor() {
    super(NOTE_THREAD_MIGRATIONS);

    const immutableProps = [
      this.pathTemplate(t => t.dataId),
      this.pathTemplate(t => t.verseRef),
      this.pathTemplate(t => t.originalSelectedText),
      this.pathTemplate(t => t.notes[ANY_INDEX].dataId),
      this.pathTemplate(t => t.notes[ANY_INDEX].ownerRef),
      this.pathTemplate(t => t.notes[ANY_INDEX].dateCreated)
    ];
    this.immutableProps.push(...immutableProps);
  }

  protected setupDomains(): ProjectDomainConfig[] {
    return [
      {
        projectDomain: SFProjectDomain.PTNoteThreads,
        pathTemplate: this.pathTemplate()
      },
      {
        projectDomain: SFProjectDomain.Notes,
        pathTemplate: this.pathTemplate(t => t.notes[ANY_INDEX])
      }
    ];
  }
  protected onDelete(userId: string, docId: string, projectDomain: string, entity: OwnedData): Promise<void> {
    if (projectDomain === SFProjectDomain.Notes) {
      this.removeEntityHaveReadRefs(userId, docId, projectDomain, entity);
    }
    return Promise.resolve();
  }

  protected onBeforeDelete(userId: string, docId: string, projectDomain: string, entity: OwnedData): Promise<void> {
    // Process an incoming deletion for a NoteThread before it happens so we can look at its list of notes.
    if (projectDomain === SFProjectDomain.PTNoteThreads) {
      this.removeEntityHaveReadRefs(userId, docId, projectDomain, entity);
    }
    return Promise.resolve();
  }

  protected async allowRead(_docId: string, doc: NoteThread, session: ConnectSession): Promise<boolean> {
    if (session.isServer || Object.keys(doc).length === 0) return true;

    if (this.server == null) {
      throw new Error('The doc service has not been initialized.');
    }

    const project: Project | undefined = await this.server.getProject(doc.projectRef);
    if (project?.userRoles[session.userId] == null) return false;
    if (
      SF_PROJECT_RIGHTS.hasRight(project, session.userId, SFProjectDomain.PTNoteThreads, Operation.View) ||
      (SF_PROJECT_RIGHTS.hasRight(project, session.userId, SFProjectDomain.SFNoteThreads, Operation.View) &&
        doc.dataId.startsWith(SF_NOTE_THREAD_PREFIX))
    ) {
      return true;
    }
    return false;
  }

  private async removeEntityHaveReadRefs(
    userId: string,
    docId: string,
    projectDomain: SFProjectDomain,
    entity: OwnedData
  ): Promise<void> {
    if (this.server == null) {
      throw Error('Null server');
    }
    const parts: string[] = docId.split(':');
    const projectId: string = parts[0];
    const conn: Connection = this.server.connect(userId);
    const pucDocs: Doc[] = (await createFetchQuery(conn, SF_PROJECT_USER_CONFIGS_COLLECTION, { projectRef: projectId }))
      .results;
    const promises: Promise<boolean>[] = [];
    for (const doc of pucDocs) {
      switch (projectDomain) {
        case SFProjectDomain.PTNoteThreads:
        case SFProjectDomain.SFNoteThreads:
          (entity as NoteThread).notes.forEach((note: Note) => promises.push(this.removeNoteHaveReadRefs(doc, note)));
          break;
        case SFProjectDomain.Notes:
          promises.push(this.removeNoteHaveReadRefs(doc, entity as Note));
          break;
      }
    }
    await Promise.all(promises);
  }

  private removeNoteHaveReadRefs(sfProjectUserConfigDoc: Doc, note: Note): Promise<boolean> {
    return docSubmitJson0Op<SFProjectUserConfig>(sfProjectUserConfigDoc, ops => {
      const data: SFProjectUserConfig = sfProjectUserConfigDoc.data;
      const index: number = data.noteRefsRead.indexOf(note.dataId);
      if (index !== -1) {
        ops.remove(puc => puc.noteRefsRead, index);
      }
    });
  }
}
