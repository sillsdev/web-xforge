import * as crc from 'crc-32';
import { RangeStatic } from 'quill';

export class Segment {
  initialChecksum?: number;

  private _text: string = '';
  private _range: RangeStatic = { index: 0, length: 0 };
  private _checksum?: number;
  private initialTextLen: number = -1;
  /** Mapping of embed ids to their position in the editor. */
  private _embeddedElements: Map<string, number> = new Map<string, number>();

  constructor(public readonly bookNum: number, public readonly chapter: number, public readonly ref: string) {}

  get text(): string {
    return this._text;
  }

  get range(): RangeStatic {
    return this._range;
  }

  get checksum(): number {
    if (this._checksum == null) {
      this._checksum = crc.str(this._text);
    }
    return this._checksum;
  }

  get isChanged(): boolean {
    return this.initialChecksum !== this.checksum;
  }

  get productiveCharacterCount(): number {
    return this._text.length - this.initialTextLen;
  }

  get embeddedElement(): Map<string, number> {
    return this._embeddedElements;
  }

  acceptChanges(): void {
    this.initialTextLen = this._text.length;
    this.initialChecksum = this.checksum;
  }

  update(text: string, range: RangeStatic, embeddedElementIndices: Map<string, number>): void {
    this._text = text;
    this._range = range;
    this._embeddedElements = embeddedElementIndices;
    this._checksum = undefined;
    if (this.initialTextLen === -1) {
      this.initialTextLen = text.length;
    }
    if (this.initialChecksum == null) {
      this.initialChecksum = this.checksum;
    }
  }
}
