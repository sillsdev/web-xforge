import { MdcDialog } from '@angular-mdc/web';
import { OverlayContainer } from '@angular-mdc/web';
import { Component, NgModule, NgZone } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { configureTestSuite } from 'ng-bullet';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { ErrorAlert, ErrorComponent } from './error.component';

describe('ErrorComponent', () => {
  configureTestSuite(() => {
    TestBed.configureTestingModule({
      declarations: [DialogOpenerComponent],
      imports: [DialogTestModule]
    });
  });

  it('should display error dialog', () => {
    const env = new TestEnvironment({
      message: 'The error message',
      stack: 'The error stack',
      eventId: '0'
    });

    expect(env.errorMessage.textContent).toBe('The error message');
    expect(env.showDetails.textContent).toBe('Show details');
    expect(env.stackTrace.style.display).toBe('none');

    env.showDetails.click();
    expect(env.showDetails.textContent).toBe('Hide details');
    expect(env.stackTrace.style.display).not.toBe('none');
    expect(env.stackTrace.textContent).toBe('The error stack');

    env.showDetails.click();
    expect(env.showDetails.textContent).toBe('Show details');
    expect(env.stackTrace.style.display).toBe('none');

    env.closeButton.click();
  });

  it('should only offer to show more when a stack trace is available', () => {
    const env = new TestEnvironment({
      message: 'Testing without stack',
      eventId: '1'
    });

    expect(env.errorMessage.textContent).toBe('Testing without stack');
    expect(env.showDetails.style.display).toBe('none');
    expect(env.stackTrace.style.display).toBe('none');
    env.closeButton.click();
  });
});

@NgModule({
  imports: [UICommonModule],
  declarations: [ErrorComponent],
  entryComponents: [ErrorComponent]
})
class DialogTestModule {}

class TestEnvironment {
  fixture: ComponentFixture<DialogOpenerComponent>;
  element: HTMLElement;

  constructor(dialogData: ErrorAlert) {
    TestBed.get(NgZone).run(() => {
      TestBed.get(MdcDialog).open(ErrorComponent, { data: dialogData });
      this.fixture = TestBed.createComponent(DialogOpenerComponent);
      this.element = TestBed.get(OverlayContainer).getContainerElement();
    });
  }

  get errorMessage(): HTMLElement {
    return this.element.querySelector('mdc-dialog-content p');
  }

  get showDetails(): HTMLElement {
    return this.element.querySelector('mdc-dialog-content > a');
  }

  get stackTrace(): HTMLElement {
    return this.element.querySelector('pre');
  }

  get closeButton(): HTMLElement {
    return this.element.querySelector('button');
  }
}
@Component({
  template: ''
})
class DialogOpenerComponent {}
