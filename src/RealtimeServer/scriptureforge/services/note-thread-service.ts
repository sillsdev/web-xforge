import { ProjectDomainConfig } from '../../common/services/project-data-service';
import { ANY_INDEX } from '../../common/utils/obj-path';
import { NoteThread, NOTE_THREAD_COLLECTION, NOTE_THREAD_INDEX_PATHS } from '../models/note-thread';
import { SFProjectDomain } from '../models/sf-project-rights';
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
        projectDomain: SFProjectDomain.NoteThreads,
        pathTemplate: this.pathTemplate()
      },
      {
        projectDomain: SFProjectDomain.Notes,
        pathTemplate: this.pathTemplate(t => t.notes[ANY_INDEX])
      }
    ];
  }
}
