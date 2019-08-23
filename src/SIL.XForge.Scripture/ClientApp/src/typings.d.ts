import Quill, {
  BoundsStatic,
  ClipboardStatic,
  DeltaOperation,
  DeltaStatic,
  QuillOptionsStatic,
  RangeStatic,
  Sources
} from 'quill';

/* SystemJS module definition */
declare var module: NodeModule;
interface NodeModule {
  id: string;
}

declare module 'quill' {
  export interface DeltaStatic {
    push?(newOp: DeltaOperation): DeltaStatic;
  }

  export interface History {
    clear(): void;
    undo(): void;
    redo(): void;
    cutoff(): void;
  }

  export interface Quill {
    theme: Theme;
    container: Element;
    scrollingContainer: Element;
    selection: Selection;
    history: History;

    isEnabled(): boolean;
    setSelection(index: number, source?: Sources): void;
  }

  export interface Selection {
    getBounds(index: number, length?: number): ClientRect;
    update(sources: Sources): void;
  }

  export class Theme {
    quill: Quill;
    options: QuillOptionsStatic;
    constructor(quill: Quill, options: QuillOptionsStatic);
  }

  export class SnowTheme extends Theme {
    pickers: Picker[];
    extendToolbar(toolbar: any): void;
  }

  export class Tooltip {
    quill: Quill;
    boundsContainer: HTMLElement;
    root: HTMLElement;
    constructor(quill: Quill, boundsContainer: HTMLElement);
    hide(): void;
    position(reference: any): number;
    show(): void;
  }

  export class Module {
    quill: Quill;
    options: QuillOptionsStatic;
    constructor(quill: Quill, options: QuillOptionsStatic);
  }

  export class Toolbar extends Module {
    controls: Array<[string, HTMLElement]>;
    handlers: { [format: string]: (value: any) => void };

    attach(input: HTMLElement): void;
    update(range: RangeStatic): void;
  }

  export class Clipboard extends Module implements ClipboardStatic {
    container: HTMLElement;

    addMatcher(selectorOrNodeType: string | number, callback: (node: any, delta: DeltaStatic) => DeltaStatic): void;
    dangerouslyPasteHTML(html: string, source?: Sources): void;
    dangerouslyPasteHTML(index: number, html: string, source?: Sources): void;
    dangerouslyPasteHTML(index: any, html?: any, source?: any): void;
    onPaste(e: ClipboardEvent): void;
    convert(html?: string): DeltaStatic;
  }

  export class Picker {
    update(): void;
  }
}
