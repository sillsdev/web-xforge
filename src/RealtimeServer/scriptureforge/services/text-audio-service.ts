import { ProjectDomainConfig } from '../../common/services/project-data-service';
import { SFProjectDomain } from '../models/sf-project-rights';
import { TextAudio, TEXT_AUDIO_COLLECTION, TEXT_AUDIO_INDEX_PATHS } from '../models/text-audio';
import { SFProjectDataService } from './sf-project-data-service';
import { TEXT_AUDIO_MIGRATIONS } from './text-audio-migrations';

/**
 * This class manages text audio timing docs.
 */
export class TextAudioService extends SFProjectDataService<TextAudio> {
  readonly collection = TEXT_AUDIO_COLLECTION;

  protected readonly indexPaths = TEXT_AUDIO_INDEX_PATHS;

  constructor() {
    super(TEXT_AUDIO_MIGRATIONS);

    const immutableProps = [this.pathTemplate(t => t.dataId)];
    this.immutableProps.push(...immutableProps);
  }

  protected setupDomains(): ProjectDomainConfig[] {
    return [
      {
        projectDomain: SFProjectDomain.TextAudio,
        pathTemplate: this.pathTemplate()
      }
    ];
  }
}
