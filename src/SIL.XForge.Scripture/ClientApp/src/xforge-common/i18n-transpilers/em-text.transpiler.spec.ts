import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  provideTranslationMarkupTranspiler,
  TokenizeResult,
  TranslationMarkupRendererFactory,
  TranslocoMarkupModule
} from 'ngx-transloco-markup';
import { TestTranslocoModule } from '../test-utils';
import { EmTextTranspiler } from './em-text.transpiler';

function createTestTranspiler(): EmTextTranspiler {
  return new EmTextTranspiler(new TranslationMarkupRendererFactory(document));
}

describe('EmTextTranspiler', () => {
  describe('tokenize function', () => {
    it('correctly recognizes the em start and boundaries', () => {
      const transpiler: EmTextTranspiler = createTestTranspiler();

      const translation: string = 'a[bc][[em]de[/c][/[/em][em]';
      const expectedTokenOffsets: number[] = [6, 18, 23];

      for (const [offset] of translation.split('').entries()) {
        const result: TokenizeResult | undefined = transpiler.tokenize(translation, offset);

        if (expectedTokenOffsets.includes(offset)) {
          expect(result).toBeDefined();
        } else {
          expect(result).toBeUndefined();
        }
      }
    });
  });

  describe('transpile and render in component', () => {
    let fixture: ComponentFixture<TestComponent>;
    let component: TestComponent;

    beforeEach(() => {
      TestBed.configureTestingModule({
        imports: [TestTranslocoModule, TranslocoMarkupModule],
        providers: [provideTranslationMarkupTranspiler(EmTextTranspiler)],
        declarations: [TestComponent]
      });

      fixture = TestBed.createComponent(TestComponent);
      component = fixture.componentInstance;
    });

    it('should render the translation with <em> tags', () => {
      component.translation = 'The [em]rain[/em] in spain [em]falls mainly[/em] on the plain';
      fixture.detectChanges();

      expect(fixture.nativeElement.firstChild.innerHTML).toBe(
        'The <em>rain</em> in spain <em>falls mainly</em> on the plain'
      );
    });
  });
});

@Component({
    selector: 'app-test',
    template: `<transloco [key]="translation"></transloco>`,
    standalone: false
})
export class TestComponent {
  translation: string = '';
}
