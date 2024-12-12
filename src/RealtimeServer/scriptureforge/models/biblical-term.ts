import { PROJECT_DATA_INDEX_PATHS, ProjectData } from '../../common/models/project-data';
import { BiblicalTermDefinition } from './biblical-term-definition';

export const BIBLICAL_TERM_COLLECTION = 'biblical_terms';
export const BIBLICAL_TERM_INDEX_PATHS = PROJECT_DATA_INDEX_PATHS;

export function getBiblicalTermDocId(projectId: string, dataId: string): string {
  return `${projectId}:${dataId}`;
}

export interface BiblicalTerm extends ProjectData {
  dataId: string;
  termId: string;
  transliteration: string;
  renderings: string[];
  description: string;
  language: string;
  links: string[];
  references: number[];
  definitions: { [language: string]: BiblicalTermDefinition };
}
