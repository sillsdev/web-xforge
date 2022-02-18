import {
  SFProjectProfile,
  SF_PROJECT_PROFILES_COLLECTION,
  SF_PROJECT_PROFILES_INDEX_PATHS
} from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectBaseDoc } from './sf-project-base-doc';

// Real-time document for the data of an sf project that all project members can access
export class SFProjectProfileDoc extends SFProjectBaseDoc<SFProjectProfile> {
  static readonly COLLECTION = SF_PROJECT_PROFILES_COLLECTION;
  static readonly INDEX_PATHS = SF_PROJECT_PROFILES_INDEX_PATHS;
}
