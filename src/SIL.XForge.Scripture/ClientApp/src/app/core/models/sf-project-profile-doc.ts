import {
  SFProject,
  SF_PROJECTS_PROFILE_COLLECTION,
  SF_PROJECTS_PROFILE_INDEX_PATHS
} from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectBaseDoc } from './sf-project-base-doc';

export class SFProjectProfileDoc extends SFProjectBaseDoc<SFProject> {
  static readonly COLLECTION = SF_PROJECTS_PROFILE_COLLECTION;
  static readonly INDEX_PATHS = SF_PROJECTS_PROFILE_INDEX_PATHS;
}
