import { OwnedData } from '../../common/models/owned-data';

export interface Comment extends OwnedData {
  text?: string;
  dataId: string;
  deleted: boolean;
  syncUserRef?: string;
  dateModified: string;
  dateCreated: string;
}
