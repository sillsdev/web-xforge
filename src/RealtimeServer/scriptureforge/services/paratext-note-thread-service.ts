import { ProjectDomainConfig } from '../../common/services/project-data-service';
import { ANY_INDEX } from '../../common/utils/obj-path';
import {
  ParatextNoteThread,
  PARATEXT_NOTE_THREAD_COLLECTION,
  PARATEXT_NOTE_THREAD_INDEX_PATHS
} from '../models/paratext-note-thread';
import { SFProjectDomain } from '../models/sf-project-rights';
import { PARATEXT_NOTE_THREAD_MIGRATIONS } from './paratext-note-thread-migrations';
import { SFProjectDataService } from './sf-project-data-service';

export class ParatextNoteThreadService extends SFProjectDataService<ParatextNoteThread> {
  readonly collection = PARATEXT_NOTE_THREAD_COLLECTION;

  protected readonly indexPaths = PARATEXT_NOTE_THREAD_INDEX_PATHS;
  protected readonly listenForUpdates = true;

  constructor() {
    super(PARATEXT_NOTE_THREAD_MIGRATIONS);

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
        projectDomain: SFProjectDomain.ParatextNoteThreads,
        pathTemplate: this.pathTemplate()
      },
      {
        projectDomain: SFProjectDomain.Notes,
        pathTemplate: this.pathTemplate(t => t.notes[ANY_INDEX])
      }
    ];
  }
}
