declare module 'rich-text' {
  import { OTType } from 'sharedb/lib/client';

  export let type: OTType;
  export { Delta, DeltaOperation } from 'quill';
}
