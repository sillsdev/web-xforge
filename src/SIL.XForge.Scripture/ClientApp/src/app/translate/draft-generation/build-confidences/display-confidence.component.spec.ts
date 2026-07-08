import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DebugElement } from '@angular/core';
import { By } from '@angular/platform-browser';
import { configureTestingModule, getTestTranslocoModule } from 'xforge-common/test-utils';
import { Confidence, UsabilityLabel } from './build-confidences';
import { DisplayConfidenceComponent } from './display-confidence.component';

describe('DisplayConfidenceComponent', () => {
  configureTestingModule(() => ({
    imports: [DisplayConfidenceComponent, getTestTranslocoModule()]
  }));

  it('good quality', () => {
    const env = new TestEnvironment({
      label: UsabilityLabel.Green
    });
    expect(env.confidenceValueElement(UsabilityLabel.Green)).not.toBeNull();
    expect(env.confidenceValueElement(UsabilityLabel.Yellow)).toBeNull();
    expect(env.confidenceValueElement(UsabilityLabel.Red)).toBeNull();
  });

  it('moderate quality', () => {
    const env = new TestEnvironment({
      label: UsabilityLabel.Yellow
    });
    expect(env.confidenceValueElement(UsabilityLabel.Green)).toBeNull();
    expect(env.confidenceValueElement(UsabilityLabel.Yellow)).not.toBeNull();
    expect(env.confidenceValueElement(UsabilityLabel.Red)).toBeNull();
  });

  it('poor quality', () => {
    const env = new TestEnvironment({
      label: UsabilityLabel.Red
    });
    expect(env.confidenceValueElement(UsabilityLabel.Green)).toBeNull();
    expect(env.confidenceValueElement(UsabilityLabel.Yellow)).toBeNull();
    expect(env.confidenceValueElement(UsabilityLabel.Red)).not.toBeNull();
  });

  /** Provides helpers for constructing test data for DisplayConfidenceComponent tests. */
  class TestEnvironment {
    readonly component: DisplayConfidenceComponent;
    readonly fixture: ComponentFixture<DisplayConfidenceComponent>;

    constructor(confidence: Partial<Confidence>) {
      this.fixture = TestBed.createComponent(DisplayConfidenceComponent);
      this.component = this.fixture.componentInstance;
      this.component.confidence = confidence as Confidence;
      this.fixture.detectChanges();
    }

    confidenceValueElement(label: UsabilityLabel): DebugElement {
      return this.fixture.debugElement.query(By.css(`.${label.toLowerCase()}`));
    }
  }
});
