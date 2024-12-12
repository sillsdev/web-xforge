import {
  BIBLICAL_TERM_COLLECTION,
  BIBLICAL_TERM_INDEX_PATHS,
  BiblicalTerm
} from 'realtime-server/lib/esm/scriptureforge/models/biblical-term';
import { ProjectDataDoc } from 'xforge-common/models/project-data-doc';

export class BiblicalTermDoc extends ProjectDataDoc<BiblicalTerm> {
  static readonly COLLECTION = BIBLICAL_TERM_COLLECTION;
  static readonly INDEX_PATHS = BIBLICAL_TERM_INDEX_PATHS;

  getBiblicalTermCategory(userLocaleCode: string, defaultLocaleCode: string): string {
    if (this.data?.definitions.hasOwnProperty(userLocaleCode)) {
      let category = this.data.definitions[userLocaleCode].categories.join(', ');
      if (category.trim() === '' && this.data?.definitions.hasOwnProperty(defaultLocaleCode)) {
        category = this.data.definitions[defaultLocaleCode].categories.join(', ');
      }
      return category;
    } else if (this.data?.definitions.hasOwnProperty(defaultLocaleCode)) {
      return this.data.definitions[defaultLocaleCode].categories.join(', ');
    } else {
      return '';
    }
  }

  getBiblicalTermGloss(userLocaleCode: string, defaultLocaleCode: string): string {
    if (this.data?.definitions.hasOwnProperty(userLocaleCode) && this.data.definitions[userLocaleCode].gloss !== '') {
      return this.data.definitions[userLocaleCode].gloss;
    } else if (this.data?.definitions.hasOwnProperty(defaultLocaleCode)) {
      return this.data.definitions[defaultLocaleCode].gloss;
    } else {
      return '';
    }
  }
}
