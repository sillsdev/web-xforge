import { obj } from '../utils/obj-path';
import { OwnedData } from './owned-data';

export const PROJECT_DATA_INDEX_PATHS: string[] = [obj<ProjectData>().pathStr(q => q.projectRef)];

export interface ProjectData extends OwnedData {
  projectRef: string;
}
