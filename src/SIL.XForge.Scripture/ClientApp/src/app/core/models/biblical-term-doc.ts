import {
  BiblicalTerm,
  BIBLICAL_TERM_COLLECTION,
  BIBLICAL_TERM_INDEX_PATHS
} from 'realtime-server/lib/esm/scriptureforge/models/biblical-term';
import { ProjectDataDoc } from 'xforge-common/models/project-data-doc';

export class BiblicalTermDoc extends ProjectDataDoc<BiblicalTerm> {
  static readonly COLLECTION = BIBLICAL_TERM_COLLECTION;
  static readonly INDEX_PATHS = BIBLICAL_TERM_INDEX_PATHS;
}
