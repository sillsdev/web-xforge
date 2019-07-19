import { ClientError } from '@orbit/data';
import { underscore } from '@orbit/utils';
import { ObjectId } from 'bson';
import { environment } from '../environments/environment';
import { ProjectDoc } from './models/project-doc';

export function nameof<T>(name: Extract<keyof T, string>): string {
  return name;
}

export function isNotFoundError(err: any): boolean {
  if (err instanceof ClientError) {
    const response: Response = (err as any).response;
    return response.status === 404;
  }
  return false;
}

export function objectId(): string {
  return new ObjectId().toHexString();
}

export function getCollectionName(type: string): string {
  if (type === ProjectDoc.TYPE) {
    return `${environment.prefix}_${type}`;
  }
  return underscore(type);
}
