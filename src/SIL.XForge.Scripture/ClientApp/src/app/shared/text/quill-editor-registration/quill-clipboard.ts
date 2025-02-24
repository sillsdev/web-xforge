import Quill, { Delta, Range } from 'quill';
import QuillClipboard from 'quill/modules/clipboard';
import { StringMap } from 'rich-text';
import { getAttributesAtPosition } from '../quill-util';
import { TextComponent } from '../text.component';

export class DisableHtmlClipboard extends QuillClipboard {
  private _textComponent: TextComponent;

  constructor(quill: Quill, options: StringMap) {
    super(quill, options);
    this._textComponent = options.textComponent;
  }

  onCapturePaste(e: ClipboardEvent): void {
    if (e.defaultPrevented || !this.quill.isEnabled() || e.clipboardData == null) {
      return;
    }

    // Prevent further handling by browser, which can cause the paste to
    // happen anyway even if we stop processing here.
    e.preventDefault();

    const range: Range = this.quill.getSelection(true);
    if (range == null) {
      return;
    }

    if (!this._textComponent.isValidSelectionForCurrentSegment(range)) {
      return;
    }

    let delta = new Delta().retain(range.index);

    const text = e.clipboardData.getData('text/plain');
    const cleanedText = text
      .replace(/\\/g, '') // Remove all backslashes first
      .replace(/(?:\r?\n)+/g, ' '); // Replace all new lines with spaces

    const pasteDelta = this.convert({ text: cleanedText });

    // add the attributes to the paste delta which should just be 1 insert op
    for (const op of pasteDelta.ops ?? []) {
      op.attributes = getAttributesAtPosition(this.quill, range.index);
    }

    delta = delta.concat(pasteDelta).delete(range.length);
    this.quill.updateContents(delta, 'user');
    this.quill.setSelection(delta.length() - range.length, 'silent');
  }
}
