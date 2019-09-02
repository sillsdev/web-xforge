import {
  MDC_DIALOG_DATA,
  MdcDialog,
  MdcDialogConfig,
  MdcDialogModule,
  MdcDialogRef,
  OverlayContainer
} from '@angular-mdc/web';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { Component, DebugElement, Directive, NgModule, ViewChild, ViewContainerRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { fakeAsync, flush } from '@angular/core/testing';
import { BrowserModule, By } from '@angular/platform-browser';
import { RouterTestingModule } from '@angular/router/testing';
import { TextInfo, TextsByBook } from 'realtime-server/lib/scriptureforge/models/text-info';
import { VerseRefData } from 'realtime-server/lib/scriptureforge/models/verse-ref-data';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { ScriptureChooserDialogComponent, ScriptureChooserDialogData } from './scripture-chooser-dialog.component';

describe('ScriptureChooserDialog', () => {
  it('initially shows book chooser, close button', () => {
    const env = new TestEnvironment();
    expect(env.dialogText).toContain(env.closeIconName);
    expect(env.dialogText).toContain('book');
    expect(env.dialogText).toContain('MAT');
  });

  it('clicking book goes to chapter chooser, shows back button', fakeAsync(() => {
    const env = new TestEnvironment();
    env.click(env.bookEphesians);
    expect(env.reference.trim()).toEqual('Ephesians');
    expect(env.dialogText).not.toContain(env.closeIconName);
    expect(env.dialogText).not.toContain('book');
    expect(env.dialogText).not.toContain('MAT');
    expect(env.dialogText).toContain(env.backIconName);
    expect(env.dialogText).toContain('chapter');
    expect(env.chapter3).toBeDefined('missing chapter 3 button');
  }));

  it('clicking chapter goes to verse chooser, shows back button', fakeAsync(() => {
    const env = new TestEnvironment();
    env.click(env.bookEphesians);
    env.click(env.chapter3);
    expect(env.reference).toEqual('Ephesians 3');
    expect(env.dialogText).not.toContain(env.closeIconName);
    expect(env.dialogText).not.toContain('book');
    expect(env.dialogText).not.toContain('MAT');
    expect(env.dialogText).not.toContain('chapter');
    expect(env.dialogText).toContain(env.backIconName);
    expect(env.verse21).toBeDefined('missing verse 21 button');
  }));

  it('clicking verse closes and reports selection', fakeAsync(() => {
    const env = new TestEnvironment();
    env.click(env.bookEphesians);
    env.click(env.chapter3);
    env.click(env.verse21);
    expect(env.afterCloseCallback).toHaveBeenCalledWith({ book: 'EPH', chapter: '3', verse: '21' });
  }));

  it('clicking X closes. dialog reports cancelled.', fakeAsync(() => {
    const env = new TestEnvironment();
    env.click(env.backoutButton);
    expect(env.afterCloseCallback).toHaveBeenCalledWith('close');
  }));

  it('clicking back at chapter selection goes to book selection', fakeAsync(() => {
    const env = new TestEnvironment();
    env.click(env.bookEphesians);
    env.click(env.backoutButton);
    expect(env.dialogText).toContain(env.closeIconName);
    expect(env.dialogText).toContain('book');
    expect(env.dialogText).toContain('MAT');
  }));

  it('clicking back at verse selection goes to chapter selection', fakeAsync(() => {
    const env = new TestEnvironment();
    env.click(env.bookEphesians);
    env.click(env.chapter3);
    env.click(env.backoutButton);
    expect(env.dialogText).toContain(env.backIconName);
    expect(env.dialogText).toContain('chapter');
    expect(env.chapter3).toBeDefined('missing chapter 3 button');
  }));

  it('book not highlighted, if no (null) incoming reference', fakeAsync(() => {
    const env = new TestEnvironment({ inputScriptureReference: null });
    expect(env.highlightedButton).toBeNull();
  }));

  it('book not highlighted, if no (omitted) incoming reference', fakeAsync(() => {
    const env = new TestEnvironment();
    expect(env.highlightedButton).toBeNull();
  }));

  it('book highlighted', fakeAsync(() => {
    const env = new TestEnvironment({ inputScriptureReference: { book: 'ROM', chapter: '11', verse: '33' } });
    env.fixture.detectChanges();
    expect(env.highlightedButton).not.toBeNull();
  }));

  it('chapter not highlighted, if no incoming reference', fakeAsync(() => {
    const env = new TestEnvironment();
    env.click(env.bookRomans);
    expect(env.highlightedButton).toBeNull();
  }));

  it('chapter highlighted, if showing incoming book reference', fakeAsync(() => {
    const env = new TestEnvironment({ inputScriptureReference: { book: 'ROM', chapter: '11', verse: '33' } });
    env.click(env.bookRomans);
    expect(env.highlightedButton).not.toBeNull();
  }));

  it('chapter not highlighted if not in right book', fakeAsync(() => {
    const env = new TestEnvironment({ inputScriptureReference: { book: 'ROM', chapter: '11', verse: '33' } });
    env.click(env.bookEphesians);
    expect(env.highlightedButton).toBeNull();
  }));

  it('verse not highlighted, if no incoming reference', fakeAsync(() => {
    const env = new TestEnvironment();
    env.click(env.bookRomans);
    env.click(env.chapter11);
    expect(env.highlightedButton).toBeNull();
  }));

  it('verse highlighted, if showing incoming book and chapter reference', fakeAsync(() => {
    const env = new TestEnvironment({ inputScriptureReference: { book: 'ROM', chapter: '11', verse: '33' } });
    env.click(env.bookRomans);
    env.click(env.chapter11);
    expect(env.highlightedButton).not.toBeNull();
  }));

  it('verse not highlighted if in right book but wrong chapter', fakeAsync(() => {
    const env = new TestEnvironment({ inputScriptureReference: { book: 'ROM', chapter: '11', verse: '33' } });
    env.click(env.bookRomans);
    env.click(env.chapter3);
    expect(env.highlightedButton).toBeNull();
  }));

  it('verse not highlighted if in right chapter number but wrong book', fakeAsync(() => {
    const env = new TestEnvironment({ inputScriptureReference: { book: 'ROM', chapter: '3', verse: '1' } });
    env.click(env.bookEphesians);
    env.click(env.chapter3);
    expect(env.highlightedButton).toBeNull();
  }));

  it('input is received', fakeAsync(() => {
    const env = new TestEnvironment({ inputScriptureReference: { book: 'EPH', chapter: '3', verse: '21' } });
    expect(env.component.data.input.book).toEqual('EPH');
    expect(env.component.data.input.chapter).toEqual('3');
    expect(env.component.data.input.verse).toEqual('21');
  }));

  it('input can omit verse', fakeAsync(() => {
    const env = new TestEnvironment({ inputScriptureReference: { book: 'EPH', chapter: '3' } });
    expect(env.component.data.input.book).toEqual('EPH');
    expect(env.component.data.input.chapter).toEqual('3');
    expect(env.component.data.input.verse).toBeUndefined();
  }));

  it('input can omit chapter and verse', fakeAsync(() => {
    const env = new TestEnvironment({ inputScriptureReference: { book: 'EPH' } });
    expect(env.component.data.input.book).toEqual('EPH');
    expect(env.component.data.input.chapter).toBeUndefined();
    expect(env.component.data.input.verse).toBeUndefined();
  }));

  it('only shows books that we seed (from project)', fakeAsync(() => {
    const env = new TestEnvironment();
    expect(env.dialogText).toContain('EXO');
    expect(env.dialogText).toContain('MAT');
    expect(env.dialogText).not.toContain('GEN');
    expect(env.dialogText).not.toContain('ACT');
  }));

  it('only shows chapters that we seed (from project)', fakeAsync(() => {
    const env = new TestEnvironment();
    env.click(env.bookRomans);
    expect(env.dialogText).toContain('11');
    expect(env.dialogText).toContain('12');
    expect(env.dialogText).not.toContain('10');
  }));

  it('shows correct number of verses for a given book and chapter', fakeAsync(() => {
    const env = new TestEnvironment();
    env.click(env.bookRomans);
    env.click(env.chapter11);
    expect(env.dialogText).toContain('1');
    expect(env.dialogText).toContain('2');
    expect(env.dialogText).toContain('3');
    expect(env.dialogText).toContain('34');
    expect(env.dialogText).toContain('35');
    const lastVerseOfRomans11 = '36';
    expect(env.dialogText).toContain(lastVerseOfRomans11);
    const nonexistentVerseOfRomans11 = '37';
    expect(env.dialogText).not.toContain(nonexistentVerseOfRomans11);
  }));

  it('identifies OT book', () => {
    const env = new TestEnvironment();
    expect(env.component.isOT('GEN')).toBe(true);
    expect(env.component.isOT('LUK')).toBe(false);
    expect(env.component.isOT('XYZ')).toBe(false);
  });

  it('splits input books by OT and NT', () => {
    const env = new TestEnvironment();
    expect(env.component.otBooks.includes('EXO')).toBe(true);
    expect(env.component.ntBooks.includes('EXO')).toBe(false);
    expect(env.component.ntBooks.includes('MAT')).toBe(true);
    expect(env.component.ntBooks.includes('ROM')).toBe(true);
    expect(env.component.otBooks.includes('MAT')).toBe(false);
    expect(env.component.otBooks.includes('ROM')).toBe(false);
  });

  it('knows if project has any OT books', () => {
    const env = new TestEnvironment();
    expect(env.component.hasOTBooks).toBe(true);
  });

  it('knows if project doesnt have any OT books', () => {
    const onlyNTTexts = [
      {
        id: 'text03',
        bookId: 'EPH',
        name: 'Ephesians',
        chapters: [{ number: 3, lastVerse: 21 }]
      } as TextInfo,
      {
        id: 'text04',
        bookId: 'ROM',
        name: 'Romans',
        chapters: [{ number: 3, lastVerse: 31 }, { number: 11, lastVerse: 36 }, { number: 12, lastVerse: 21 }]
      } as TextInfo
    ];
    const env = new TestEnvironment({ textsInProject: onlyNTTexts });
    expect(env.component.hasOTBooks).toBe(false);
  });

  it('only shows verses if providing end-selection', fakeAsync(() => {
    const env = new TestEnvironment({
      inputScriptureReference: { book: 'EPH', chapter: '3', verse: '17' },
      rangeStart: { book: 'EPH', chapter: '3', verse: '15' }
    });
    expect(env.reference).toContain('Ephesians 3');
    expect(env.dialogText).toContain(env.closeIconName);
    expect(env.dialogText).not.toContain(env.backIconName);
    // Should contain verses from starting verse to last verse, inclusive.
    expect(env.dialogText).not.toContain('13');
    expect(env.dialogText).not.toContain('14');
    expect(env.dialogText).toContain('15');
    expect(env.dialogText).toContain('16');
    expect(env.dialogText).toContain('21');

    env.click(env.verse21);
    expect(env.afterCloseCallback).toHaveBeenCalledWith({ book: 'EPH', chapter: '3', verse: '21' });
  }));

  it('close button works for end-selection chooser', fakeAsync(() => {
    const env = new TestEnvironment({
      rangeStart: { book: 'EPH', chapter: '3', verse: '15' }
    });
    expect(env.dialogText).toContain(env.closeIconName);
    expect(env.reference).toContain('Ephesians 3');
    env.click(env.backoutButton);
    expect(env.afterCloseCallback).toHaveBeenCalledWith('close');
  }));

  it('ignores rangeStart if book not in texts', fakeAsync(() => {
    const texts: TextInfo[] = [
      {
        bookId: 'EPH',
        name: 'Ephesians',
        chapters: [{ number: 3, lastVerse: 21 }]
      },
      {
        bookId: 'ROM',
        name: 'Romans',
        chapters: [{ number: 3, lastVerse: 31 }, { number: 11, lastVerse: 36 }, { number: 12, lastVerse: 21 }]
      }
      // No RUT text
    ];

    const env = new TestEnvironment({
      inputScriptureReference: { book: 'EPH', chapter: '3', verse: '17' },
      textsInProject: texts,
      // rangeStart is for book that is not in texts
      rangeStart: { book: 'RUT', chapter: '3', verse: '15' }
    });

    // Is not 'rangeEnd'
    expect(env.component.showing).toEqual('books');

    expect(env.dialogText).toContain(env.closeIconName);
    expect(env.dialogText).toContain('book');
    // Other books are shown to select from other than inputScriptureReference and rangeStart books.
    expect(env.dialogText).toContain('ROM');

    // Should not contain a Scripture reference
    expect(env.dialogText).not.toContain('Ephesians');
    expect(env.dialogText).not.toContain('Ruth');

    // Did not pre-select rangeStart values.
    expect(env.component.selection.book).toBeUndefined();
    expect(env.component.selection.chapter).toBeUndefined();
  }));

  it('ignores rangeStart if chapter not in texts', fakeAsync(() => {
    const texts: TextInfo[] = [
      {
        bookId: 'EPH',
        name: 'Ephesians',
        chapters: [{ number: 3, lastVerse: 21 }]
      },
      {
        bookId: 'ROM',
        name: 'Romans',
        chapters: [{ number: 3, lastVerse: 31 }, { number: 11, lastVerse: 36 }, { number: 12, lastVerse: 21 }]
      }
    ];

    const env = new TestEnvironment({
      inputScriptureReference: { book: 'EPH', chapter: '3', verse: '17' },
      textsInProject: texts,
      // rangeStart is for chapter that is not in texts
      rangeStart: { book: 'ROM', chapter: '4', verse: '15' }
    });

    // Is not 'rangeEnd'
    expect(env.component.showing).toEqual('books');

    expect(env.dialogText).toContain(env.closeIconName);
    expect(env.dialogText).toContain('book');
    expect(env.dialogText).toContain('ROM');
    expect(env.dialogText).toContain('EPH');

    // Should not contain a Scripture reference
    expect(env.dialogText).not.toContain('Ephesians');
    expect(env.dialogText).not.toContain('Romans');

    // Did not pre-select rangeStart values.
    expect(env.component.selection.book).toBeUndefined();
    expect(env.component.selection.chapter).toBeUndefined();
  }));

  it('ignores rangeStart if verse > lastVerse', fakeAsync(() => {
    const texts: TextInfo[] = [
      {
        bookId: 'EPH',
        name: 'Ephesians',
        chapters: [{ number: 3, lastVerse: 21 }]
      },
      {
        bookId: 'ROM',
        name: 'Romans',
        chapters: [{ number: 3, lastVerse: 31 }, { number: 11, lastVerse: 36 }, { number: 12, lastVerse: 21 }]
      }
    ];

    const env = new TestEnvironment({
      inputScriptureReference: { book: 'EPH', chapter: '3', verse: '17' },
      textsInProject: texts,
      // rangeStart is for invalid verse
      rangeStart: { book: 'ROM', chapter: '3', verse: '99' }
    });

    // Is not 'rangeEnd'
    expect(env.component.showing).toEqual('books');

    expect(env.dialogText).toContain(env.closeIconName);
    expect(env.dialogText).toContain('book');
    expect(env.dialogText).toContain('ROM');
    expect(env.dialogText).toContain('EPH');

    // Should not contain a Scripture reference
    expect(env.dialogText).not.toContain('Ephesians');
    expect(env.dialogText).not.toContain('Romans');

    // Did not pre-select rangeStart values.
    expect(env.component.selection.book).toBeUndefined();
    expect(env.component.selection.chapter).toBeUndefined();
  }));

  @Directive({
    // ts lint complains that a directive should be used as an attribute
    // tslint:disable-next-line:directive-selector
    selector: 'viewContainerDirective'
  })
  class ViewContainerDirective {
    constructor(public viewContainerRef: ViewContainerRef) {}
  }

  @Component({
    selector: 'app-view-container',
    template: '<viewContainerDirective></viewContainerDirective>'
  })
  class ChildViewContainerComponent {
    @ViewChild(ViewContainerDirective, { static: true }) viewContainer: ViewContainerDirective;

    get childViewContainer(): ViewContainerRef {
      return this.viewContainer.viewContainerRef;
    }
  }

  @NgModule({
    imports: [BrowserModule, HttpClientTestingModule, RouterTestingModule, UICommonModule, MdcDialogModule],
    declarations: [ViewContainerDirective, ChildViewContainerComponent, ScriptureChooserDialogComponent],
    exports: [ViewContainerDirective, ChildViewContainerComponent, ScriptureChooserDialogComponent],
    entryComponents: [ChildViewContainerComponent, ScriptureChooserDialogComponent]
  })
  class TestModule {}

  class TestEnvironment {
    fixture: ComponentFixture<ChildViewContainerComponent>;
    component: ScriptureChooserDialogComponent;
    dialogRef: MdcDialogRef<ScriptureChooserDialogComponent>;
    overlayContainerElement: HTMLElement;
    afterCloseCallback: jasmine.Spy;
    closeIconName = 'close';
    backIconName = 'navigate_before';

    constructor(args?: {
      inputScriptureReference?: VerseRefData;
      textsInProject?: TextInfo[];
      rangeStart?: VerseRefData;
    }) {
      TestBed.configureTestingModule({
        imports: [TestModule],
        providers: [{ provide: MDC_DIALOG_DATA }]
      });
      this.fixture = TestBed.createComponent(ChildViewContainerComponent);
      const viewContainerRef = this.fixture.componentInstance.childViewContainer;

      let inputScriptureReference;
      let rangeStart;
      if (args) {
        inputScriptureReference = args.inputScriptureReference;
        rangeStart = args.rangeStart;
      }

      let textsInProject = [
        {
          id: 'text01',
          bookId: 'EXO',
          name: 'Exodus',
          chapters: [{ number: 39, lastVerse: 43 }, { number: 40, lastVerse: 38 }]
        } as TextInfo,
        {
          id: 'text02',
          bookId: 'MAT',
          name: 'Matthew',
          chapters: [{ number: 1, lastVerse: 25 }, { number: 2, lastVerse: 23 }]
        } as TextInfo,
        {
          id: 'text03',
          bookId: 'EPH',
          name: 'Ephesians',
          chapters: [{ number: 3, lastVerse: 21 }]
        } as TextInfo,
        {
          id: 'text04',
          bookId: 'ROM',
          name: 'Romans',
          chapters: [{ number: 3, lastVerse: 31 }, { number: 11, lastVerse: 36 }, { number: 12, lastVerse: 21 }]
        } as TextInfo
      ];
      if (args && args.textsInProject) {
        textsInProject = args.textsInProject;
      }

      const booksAndChaptersToshow: TextsByBook = {};
      textsInProject.map(text => (booksAndChaptersToshow[text.bookId] = text));

      const config: MdcDialogConfig<ScriptureChooserDialogData> = {
        scrollable: true,
        viewContainerRef: viewContainerRef,
        data: { input: inputScriptureReference, booksAndChaptersToShow: booksAndChaptersToshow, rangeStart: rangeStart }
      };
      this.dialogRef = TestBed.get(MdcDialog).open(ScriptureChooserDialogComponent, config);
      this.afterCloseCallback = jasmine.createSpy('afterClose callback');
      this.dialogRef.afterClosed().subscribe(this.afterCloseCallback);
      this.component = this.dialogRef.componentInstance;
      this.overlayContainerElement = TestBed.get(OverlayContainer).getContainerElement();

      this.fixture.detectChanges();
    }

    get dialogText(): string {
      return this.overlayContainerElement.textContent;
    }

    get bookEphesians(): DebugElement {
      return this.buttonWithText('EPH');
    }

    get bookRomans(): DebugElement {
      return this.buttonWithText('ROM');
    }

    get chapter3(): DebugElement {
      return this.buttonWithText('3');
    }

    get chapter11(): DebugElement {
      return this.buttonWithText('11');
    }

    get verse21(): DebugElement {
      return this.buttonWithText('21');
    }

    get verse33(): DebugElement {
      return this.buttonWithText('33');
    }

    get reference(): string {
      return this.fixture.debugElement.query(By.css('.reference')).nativeElement.textContent;
    }

    get backoutButton(): DebugElement {
      return this.fixture.debugElement.query(By.css('#backout-button'));
    }

    get highlightedButton(): DebugElement {
      return this.fixture.debugElement.query(By.css('.ngx-mdc-button--primary'));
    }

    click(element: DebugElement): void {
      element.nativeElement.click();
      this.fixture.detectChanges();
      flush();
    }

    buttonWithText(text: string): DebugElement {
      return this.fixture.debugElement
        .queryAll(By.css('button'))
        .find(button => button.nativeElement.innerText === text);
    }
  }
});
