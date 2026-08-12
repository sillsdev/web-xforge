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
    const env = new TestEnvironment(true, true);
    expect(env.icon()).not.toBeNull();
    expect(env.text()).not.toBeNull();
  });

  it('low confidence icon only', () => {
    const env = new TestEnvironment(true, false);
    expect(env.icon()).not.toBeNull();
    expect(env.text()).toBeNull();
  });

  it('not low confidence', () => {
    const env = new TestEnvironment(false, true);
    expect(env.icon()).toBeNull();
    expect(env.text()).toBeNull();
  });

  /** Provides helpers for constructing test data for DisplayConfidenceComponent tests. */
  class TestEnvironment {
    readonly component: DisplayConfidenceComponent;
    readonly fixture: ComponentFixture<DisplayConfidenceComponent>;

    constructor(lowConfidence: boolean, showText: boolean) {
      this.fixture = TestBed.createComponent(DisplayConfidenceComponent);
      this.component = this.fixture.componentInstance;
      this.component.lowConfidence = lowConfidence;
      this.component.showText = showText;
      this.fixture.detectChanges();
    }

    icon(): DebugElement {
      return this.fixture.debugElement.query(By.css('mat-icon'));
    }

    text(): DebugElement {
      return this.fixture.debugElement.query(By.css('span'));
    }
  }
});
