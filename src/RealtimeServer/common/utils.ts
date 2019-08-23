import { Doc } from 'sharedb/lib/client';

export function docFetch(doc: Doc): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    doc.fetch(err => {
      if (err != null) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

export function docSubmitOp(doc: Doc, components: any): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    doc.submitOp(components, undefined, err => {
      if (err != null) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}
