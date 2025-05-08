import { kebabCase } from 'lodash-es';
import QuillInlineBlot from 'quill/blots/inline';
import { LynxInsight } from '../../lynx-insight';

export class LynxInsightBlot extends QuillInlineBlot {
  static tagName = 'lynx-insight';
  static idDatasetPropName = 'insightId';
  static idAttributeName = kebabCase(LynxInsightBlot.idDatasetPropName);
  static nodeValuePropName = '__lynxInsight';

  /**
   * This custom prop is used on the parent class instead of using 'className'
   * so that it isn't registered to the wrong child blot type.
   * This way 'lynx-insight' class can be added to all child insight blots in addition to the 'className'
   * specified in the child blot classes.
   */
  static superClassName = 'lynx-insight';

  static create(value: LynxInsight | LynxInsight[]): HTMLElement {
    const node = super.create() as HTMLElement;
    LynxInsightBlot.formatNode(node, value);
    return node;
  }

  static formats(node: HTMLElement): any {
    return LynxInsightBlot.value(node);
  }

  static value(node: HTMLElement): LynxInsight | LynxInsight[] | undefined {
    return node[LynxInsightBlot.nodeValuePropName];
  }

  format(name: string, value: any): void {
    if (name === this.statics.blotName) {
      if (!value) {
        // Remove format
        delete this.domNode.dataset[LynxInsightBlot.idDatasetPropName];
        delete this.domNode[LynxInsightBlot.nodeValuePropName];
      } else {
        // Apply format
        LynxInsightBlot.formatNode(this.domNode, value);
      }
    } else {
      super.format(name, value);
    }
  }

  private static formatNode(node: HTMLElement, value: LynxInsight | LynxInsight[]): void {
    const insights = Array.isArray(value) ? value : [value];
    node.classList.add(LynxInsightBlot.superClassName);

    if (insights.length === 1) {
      node.dataset[LynxInsightBlot.idDatasetPropName] = insights[0].id;
      node[LynxInsightBlot.nodeValuePropName] = insights[0];
    } else {
      // For multiple insights, store ids as comma-separated list
      node.dataset[LynxInsightBlot.idDatasetPropName] = insights.map(i => i.id).join(',');
      node[LynxInsightBlot.nodeValuePropName] = insights;
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
