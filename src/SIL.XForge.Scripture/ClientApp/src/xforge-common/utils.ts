import { ObjectId } from 'bson';

export function nameof<T>(name: Extract<keyof T, string>): string {
  return name;
}

export function objectId(): string {
  return new ObjectId().toHexString();
}
