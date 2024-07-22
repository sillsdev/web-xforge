import { kebabCase } from 'lodash-es';
import QuillInlineBlot from 'quill/blots/inline';
import { LynxInsight } from '../../lynx-insight';

export class LynxInsightBlot extends QuillInlineBlot {
  static tagName = 'span';
  static idDatasetPropName = 'insightId';
  static idAttributeName = kebabCase(LynxInsightBlot.idDatasetPropName);

  /**
   * This custom prop is used on the parent class instead of using 'className'
   * so that it isn't registered to the wrong child blot type.
   * This way 'lynx-insight' class can be added to all child insight blots in addition to the 'className'
   * specified in the child blot classes.
   */
  static superClassName = 'lynx-insight';

  static create(value: LynxInsight): HTMLElement {
    const node = super.create(value) as HTMLElement;
    LynxInsightBlot.formatNode(node, value);
    return node;
  }

  static formats(node: HTMLElement): any {
    return LynxInsightBlot.value(node);
  }

  static value(node: HTMLElement): string | undefined {
    return node.dataset[LynxInsightBlot.idDatasetPropName];
  }

  format(name: string, value?: LynxInsight): void {
    if (value && name === this.statics.blotName) {
      LynxInsightBlot.formatNode(this.domNode, value);
    } else {
      super.format(name, value);
    }
  }

  private static formatNode(node: HTMLElement, value: LynxInsight): void {
    node.classList.add(LynxInsightBlot.superClassName);
    node.dataset[LynxInsightBlot.idDatasetPropName] = value.id;
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
