import { ObjectId } from 'bson';

export function nameof<T>(name: Extract<keyof T, string>): string {
  return name;
}

export function objectId(): string {
  return new ObjectId().toHexString();
}

export function promiseTimeout<T>(promise: Promise<T>, timeout: number) {
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      setTimeout(reject, timeout);
    })
  ]);
}
