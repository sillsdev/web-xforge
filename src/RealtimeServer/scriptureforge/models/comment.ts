import { OwnedData } from '../../common/models/owned-data';

export interface Comment extends OwnedData {
  dataId: string;
  syncUserRef?: string;
  text?: string;
  dateModified: string;
  dateCreated: string;
}
