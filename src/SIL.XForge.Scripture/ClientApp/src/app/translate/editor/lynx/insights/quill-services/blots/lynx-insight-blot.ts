import Parchment from 'parchment';
import Quill from 'quill';

const Inline = Quill.import('blots/inline') as typeof Parchment.Inline;

class LynxInsightBlot extends Inline {
  static tagName = 'span';
  static idsAttributeName = 'data-insight-ids';

  static create(value: any): Node {
    // console.log('LynxInsightBlot create', value);
    const node = super.create(value) as HTMLElement;
    this.formatNode(node, value);
    return node;
  }

  static formats(node: HTMLElement): any {
    // console.log('static formats()', node);
    return this.value(node);
  }

  static value(node: HTMLElement): string | undefined {
    return node.dataset.insightIds;
  }

  format(name: string, value: any): void {
    // console.log('format()', name, value);

    if (value && name === this.statics.blotName) {
      LynxInsightBlot.formatNode(this.domNode, value);
    } else {
      super.format(name, value);
    }
  }

  private static formatNode(node: HTMLElement, value: any): void {
    // console.log('formatNode', node, value);
    node.classList.add('lynx-insight'); // Set class here instead of 'className' so that it isn't registered to the wrong blot type
    node.setAttribute('lynx-insight', ''); // needed for overlay // TODO: factor out attribute name

    LynxInsightBlot.addInsightId(node, value.id);

    if (value?.displayState?.promptActive) {
      node.classList.add('prompt-active');
      node.setAttribute('data-prompt-active', value.type);
      // } else {
      //   node.classList.remove('prompt-active');
      //   node.removeAttribute('data-prompt-active'));
    }

    if (value?.displayState?.actionMenuActive) {
      node.classList.add('action-menu-active');
      node.setAttribute('data-action-menu-active', value.type);
      // } else {
      //   node.classList.remove('action-menu-active');
      //   node.removeAttribute('data-action-menu-active');
    }

    // if (value?.displayState?.cursorActive) {
    //   node.classList.add('cursor-active');
    //   node.setAttribute('data-action-menu-active', value.type);
    // } else {
    //   node.classList.remove('cursor-active');
    //   node.removeAttribute('data-action-menu-active');
    // }
  }

  private static addInsightId(node: HTMLElement, id: string): void {
    const insightIdsStr = node.getAttribute(LynxInsightBlot.idsAttributeName);
    const insightIdsArr = insightIdsStr?.length ? insightIdsStr.split(' ') : [];

    if (!insightIdsArr.includes(id)) {
      insightIdsArr.push(id);
      node.setAttribute(LynxInsightBlot.idsAttributeName, insightIdsArr.join(' '));
    }
  }
}

export class LynxInsightInfoBlot extends LynxInsightBlot {
  static blotName = 'lynx-insight-info';
  static className = 'info';
}
export class LynxInsightWarningBlot extends LynxInsightBlot {
  static blotName = 'lynx-insight-warning';
  static className = 'warning';
}
export class LynxInsightErrorBlot extends LynxInsightBlot {
  static blotName = 'lynx-insight-error';
  static className = 'error';
}

export const lynxInsightBlots: (typeof LynxInsightBlot)[] = [
  LynxInsightInfoBlot,
  LynxInsightWarningBlot,
  LynxInsightErrorBlot
];
