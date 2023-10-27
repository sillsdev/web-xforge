import { Injectable } from '@angular/core';
import { BlockTranspiler, TranslationMarkupRenderer, TranslationMarkupRendererFactory } from 'ngx-transloco-markup';

/**
 * Custom `ngx-transloco-markup` transpiler for rendering [em][/em] tags as <em></em>.
 */
@Injectable({ providedIn: 'root' })
export class EmTextTranspiler extends BlockTranspiler {
  constructor(private readonly rendererFactory: TranslationMarkupRendererFactory) {
    super('[em]', '[/em]');
  }

  /** @inheritdoc */
  protected createRenderer(childRenderers: TranslationMarkupRenderer[]): TranslationMarkupRenderer {
    return this.rendererFactory.createElementRenderer('em', childRenderers);
  }
}
