import { OwnedData } from '../../common/models/owned-data';

export interface Comment extends OwnedData {
  dataId: string;
  deleted: boolean;
  syncUserRef?: string;
  text?: string;
  dateModified: string;
  dateCreated: string;
}
