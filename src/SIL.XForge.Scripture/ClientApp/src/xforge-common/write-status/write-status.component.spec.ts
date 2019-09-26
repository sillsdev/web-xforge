import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { configureTestSuite } from 'ng-bullet';
import { ElementState } from '../models/element-state';
import { UICommonModule } from '../ui-common.module';
import { WriteStatusComponent } from './write-status.component';

describe('WriteStatusComponent', () => {
  configureTestSuite(() => {
    TestBed.configureTestingModule({
      declarations: [WriteStatusComponent, TestHostComponent],
      imports: [UICommonModule]
    });
  });

  it('should display done, spinner and error icons', () => {
    const env = new TestEnvironment();
    expect(env.statusDone).toBeNull('InSync-done');
    expect(env.statusError).toBeNull('InSync-error');
    expect(env.statusSubmitting).toBeNull('InSync-spinner');

    env.setControlState(ElementState.Submitted);
    expect(env.statusDone).not.toBeNull('Submitted-done');
    expect(env.statusError).toBeNull('Submitted-error');
    expect(env.statusSubmitting).toBeNull('Submitted-spinner');

    env.setControlState(ElementState.Error);
    expect(env.statusError).not.toBeNull('Error-error');
    expect(env.statusDone).toBeNull('Error-done');
    expect(env.statusSubmitting).toBeNull('Error-spinner');

    env.setControlState(ElementState.Submitting);
    expect(env.statusSubmitting).not.toBeNull('Submitting-spinner');
    expect(env.statusDone).toBeNull('Submitting-done');
    expect(env.statusError).toBeNull('Submitting-error');
  });
});

class TestEnvironment {
  fixture: ComponentFixture<TestHostComponent>;
  component: TestHostComponent;

  constructor() {
    this.fixture = TestBed.createComponent(TestHostComponent);
    this.component = this.fixture.componentInstance;
    this.fixture.detectChanges();
  }

  get statusDone(): HTMLElement {
    return this.fixture.nativeElement.querySelector('#test-status .check-icon');
  }

  get statusError(): HTMLElement {
    return this.fixture.nativeElement.querySelector('#test-status .error-icon');
  }

  get statusSubmitting(): HTMLElement {
    return this.fixture.nativeElement.querySelector('#test-status mat-spinner');
  }

  setControlState(state: ElementState): void {
    this.component.controlState = state;
    this.fixture.detectChanges();
  }
}

@Component({
  template: `
    <app-write-status id="test-status" [state]="controlState" [formGroup]="testForm"></app-write-status>
  `
})
class TestHostComponent {
  testForm: FormGroup = new FormGroup({
    controlOne: new FormControl('controlOneValue', Validators.required)
  });
  controlState: ElementState = ElementState.InSync;
}
