import {
  SFProject,
  SF_PROJECTS_COLLECTION,
  SF_PROJECT_INDEX_PATHS
} from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectBaseDoc } from './sf-project-base-doc';

export class SFProjectDoc extends SFProjectBaseDoc<SFProject> {
  static readonly COLLECTION = SF_PROJECTS_COLLECTION;
  static readonly INDEX_PATHS = SF_PROJECT_INDEX_PATHS;
}
