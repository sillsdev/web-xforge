import { OwnedData } from '../../common/models/owned-data';
import { Value } from './value';

export interface Comment extends OwnedData, Value {
  dataId: string;
  deleted: boolean;
  syncUserRef?: string;
  dateModified: string;
  dateCreated: string;
}
