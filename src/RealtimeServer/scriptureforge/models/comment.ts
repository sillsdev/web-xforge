import { OwnedData } from '../../common/models/owned-data';

export interface Comment extends OwnedData {
  id: string;
  syncUserRef?: string;
  text?: string;
  dateModified: string;
  dateCreated: string;
}
