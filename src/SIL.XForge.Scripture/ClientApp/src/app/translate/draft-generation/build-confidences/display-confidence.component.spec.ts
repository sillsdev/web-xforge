import { DebugElement } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { configureTestingModule, getTestTranslocoModule } from 'xforge-common/test-utils';
import { DisplayConfidenceComponent } from './display-confidence.component';

describe('DisplayConfidenceComponent', () => {
  configureTestingModule(() => ({
    imports: [getTestTranslocoModule(), DisplayConfidenceComponent]
  }));

  it('low confidence with icon and text', () => {
    const env = new TestEnvironment(false, true, false);
    expect(env.icon).not.toBeNull();
    expect(env.text).not.toBeNull();
    expect(env.notice).toBeNull();
  });

  it('low confidence icon only', () => {
    const env = new TestEnvironment(true, false, false);
    expect(env.icon).not.toBeNull();
    expect(env.text).toBeNull();
    expect(env.notice).toBeNull();
  });

  it('not low confidence', () => {
    const env = new TestEnvironment(false, false, false);
    expect(env.icon).toBeNull();
    expect(env.text).toBeNull();
    expect(env.notice).toBeNull();
  });

  it('low confidence notice one book with name', () => {
    const env = new TestEnvironment(false, false, true, 1, 'Genesis');
    expect(env.icon).toBeNull();
    expect(env.text).toBeNull();
    expect(env.notice).not.toBeNull();
  });

  it('low confidence notice one book', () => {
    const env = new TestEnvironment(false, false, true, 1);
    expect(env.icon).toBeNull();
    expect(env.text).toBeNull();
    expect(env.notice).not.toBeNull();
  });

  it('low confidence notice multiple books', () => {
    const env = new TestEnvironment(false, false, true, 2);
    expect(env.icon).toBeNull();
    expect(env.text).toBeNull();
    expect(env.notice).not.toBeNull();
  });

  /** Provides helpers for constructing test data for DisplayConfidenceComponent tests. */
  class TestEnvironment {
    readonly component: DisplayConfidenceComponent;
    readonly fixture: ComponentFixture<DisplayConfidenceComponent>;

    constructor(
      showIcon: boolean,
      showIconAndText: boolean,
      showNotice: boolean,
      booksWithLowConfidence: number = 0,
      bookNameWithLowConfidence: string | undefined = undefined
    ) {
      this.fixture = TestBed.createComponent(DisplayConfidenceComponent);
      this.component = this.fixture.componentInstance;
      this.component.showIcon = showIcon;
      this.component.showIconAndText = showIconAndText;
      this.component.showNotice = showNotice;
      this.component.booksWithLowConfidence = booksWithLowConfidence;
      this.component.bookNameWithLowConfidence = bookNameWithLowConfidence;
      this.fixture.detectChanges();
    }

    get icon(): DebugElement {
      return this.fixture.debugElement.query(By.css('mat-icon'));
    }

    get notice(): DebugElement {
      return this.fixture.debugElement.query(By.css('app-notice'));
    }

    get text(): DebugElement {
      return this.fixture.debugElement.query(By.css('.red span'));
    }
  }
});
