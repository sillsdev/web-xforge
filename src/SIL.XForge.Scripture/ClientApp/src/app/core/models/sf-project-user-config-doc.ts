import { VerseRef } from '@sillsdev/scripture';
import {
  SFProjectUserConfig,
  SF_PROJECT_USER_CONFIGS_COLLECTION,
  SF_PROJECT_USER_CONFIG_INDEX_PATHS
} from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config';
import { ProjectDataDoc } from 'xforge-common/models/project-data-doc';

export class SFProjectUserConfigDoc extends ProjectDataDoc<SFProjectUserConfig> {
  static readonly COLLECTION = SF_PROJECT_USER_CONFIGS_COLLECTION;
  static readonly INDEX_PATHS = SF_PROJECT_USER_CONFIG_INDEX_PATHS;

  updateAudioRefsPlayed(verseRef?: VerseRef): void {
    if (this.data == null || verseRef == null) {
      return;
    }
    this.submitJson0Op(op => {
      for (let ref of verseRef.allVerses()) {
        if (this.data!.audioRefsPlayed?.includes(ref.toString())) {
          continue;
        }
        op.add(puc => puc.audioRefsPlayed, ref.toString());
      }
    });
  }
}
