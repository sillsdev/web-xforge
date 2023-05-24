import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { ElementState } from '../models/element-state';
import { configureTestingModule } from '../test-utils';
import { UICommonModule } from '../ui-common.module';
import { WriteStatusComponent } from './write-status.component';

describe('WriteStatusComponent', () => {
  configureTestingModule(() => ({
    declarations: [WriteStatusComponent, TestHostComponent],
    imports: [UICommonModule]
  }));

  it('should display done, spinner and error icons', () => {
    const env = new TestEnvironment();
    expect(env.statusDone).withContext('InSync-done').toBeNull();
    expect(env.statusError).withContext('InSync-error').toBeNull();
    expect(env.statusSubmitting).withContext('InSync-spinner').toBeNull();

    env.setControlState(ElementState.Submitted);
    expect(env.statusDone).withContext('Submitted-done').not.toBeNull();
    expect(env.statusError).withContext('Submitted-error').toBeNull();
    expect(env.statusSubmitting).withContext('Submitted-spinner').toBeNull();

    env.setControlState(ElementState.Error);
    expect(env.statusError).withContext('Error-error').not.toBeNull();
    expect(env.statusDone).withContext('Error-done').toBeNull();
    expect(env.statusSubmitting).withContext('Error-spinner').toBeNull();

    env.setControlState(ElementState.Submitting);
    expect(env.statusSubmitting).withContext('Submitting-spinner').not.toBeNull();
    expect(env.statusDone).withContext('Submitting-done').toBeNull();
    expect(env.statusError).withContext('Submitting-error').toBeNull();
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
  template: `<app-write-status id="test-status" [state]="controlState" [formGroup]="testForm"></app-write-status>`
})
class TestHostComponent {
  testForm: FormGroup = new FormGroup({
    controlOne: new FormControl('controlOneValue', Validators.required)
  });
  controlState: ElementState = ElementState.InSync;
}
