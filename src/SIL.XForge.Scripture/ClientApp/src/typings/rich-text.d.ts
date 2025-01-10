declare module 'rich-text' {
  import { OTType } from 'sharedb/lib/client';

  export let type: OTType;
  export { Op as DeltaOperation } from 'quill';

  export interface StringMap {
    [key: string]: any;
  }
}
