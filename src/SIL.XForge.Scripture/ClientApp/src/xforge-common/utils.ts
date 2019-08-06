import { ObjectId } from 'bson';
import { environment } from '../environments/environment';
import { ProjectDoc } from './models/project-doc';

export function nameof<T>(name: Extract<keyof T, string>): string {
  return name;
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

/**
 * Underscore words that are dasherized, space-delimited, or camelCased.
 */
export function underscore(str: string): string {
  return str
    .replace(/([a-z\d])([A-Z]+)/g, '$1_$2')
    .replace(/\-|\s+/g, '_')
    .toLowerCase();
}
