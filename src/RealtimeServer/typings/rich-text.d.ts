declare module 'rich-text' {
  import Delta from 'quill-delta';

  export const type: { name: string };
  export { Op as DeltaOperation } from 'quill-delta';
  export { Delta };
}
