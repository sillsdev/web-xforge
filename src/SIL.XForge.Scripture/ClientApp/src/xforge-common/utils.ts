import { ClientError } from '@orbit/data';
import { underscore } from '@orbit/utils';
import { ObjectId } from 'bson';
import { environment } from '../environments/environment';
import { Project } from './models/project';

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
  if (type === Project.TYPE) {
    return `${environment.prefix}_project_data`;
  }
  return underscore(type);
}
