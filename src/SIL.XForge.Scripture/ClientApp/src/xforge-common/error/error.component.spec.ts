import { MdcDialog, MdcDialogConfig } from '@angular-mdc/web/dialog';
import { CommonModule } from '@angular/common';
import { Component, Directive, NgModule, ViewChild, ViewContainerRef } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { configureTestingModule, TestTranslocoModule } from '../test-utils';
import { UICommonModule } from '../ui-common.module';
import { ErrorAlert, ErrorComponent } from './error.component';

describe('ErrorComponent', () => {
  configureTestingModule(() => ({
    imports: [DialogTestModule]
  }));

  it('should display error dialog', fakeAsync(() => {
    const env = new TestEnvironment({
      message: 'The error message',
      stack: 'The error stack',
      eventId: '0'
    });

    expect(env.errorMessage.textContent).toBe('The error message');
    expect(env.showDetails.textContent).toBe('Show details');
    expect(env.stackTrace.style.display).toBe('none');
    expect(env.errorId.style.display).toBe('none');

    env.showDetails.click();
    env.fixture.detectChanges();
    expect(env.showDetails.textContent).toBe('Hide details');
    expect(env.stackTrace.style.display).not.toBe('none');
    expect(env.stackTrace.textContent).toBe('The error stack');
    expect(env.errorId.style.display).not.toBe('none');
    expect(env.errorId.textContent).toBe('Error ID: 0');

    env.showDetails.click();
    env.fixture.detectChanges();
    expect(env.showDetails.textContent).toBe('Show details');
    expect(env.stackTrace.style.display).toBe('none');
    expect(env.errorId.style.display).toBe('none');
    env.closeButton.click();
    flush();
  }));
});

@Directive({
  // es lint complains that a directive should be used as an attribute
  // eslint-disable-next-line @angular-eslint/directive-selector
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
  @ViewChild(ViewContainerDirective, { static: true }) viewContainer!: ViewContainerDirective;

  get childViewContainer(): ViewContainerRef {
    return this.viewContainer.viewContainerRef;
  }
}

@NgModule({
  imports: [CommonModule, UICommonModule, TestTranslocoModule],
  declarations: [ViewContainerDirective, ChildViewContainerComponent, ErrorComponent],
  exports: [ViewContainerDirective, ChildViewContainerComponent, ErrorComponent]
})
class DialogTestModule {}

class TestEnvironment {
  readonly fixture: ComponentFixture<ChildViewContainerComponent>;

  constructor(dialogData: ErrorAlert) {
    this.fixture = TestBed.createComponent(ChildViewContainerComponent);
    const viewContainerRef = this.fixture.componentInstance.childViewContainer;
    const config: MdcDialogConfig<ErrorAlert> = {
      data: dialogData,
      viewContainerRef
    };
    TestBed.inject(MdcDialog).open(ErrorComponent, config);
    this.fixture.detectChanges();
    tick();
  }

  get overlayContainerElement(): HTMLElement {
    return this.fixture.nativeElement.parentElement.querySelector('.cdk-overlay-container');
  }

  get errorMessage(): HTMLElement {
    return this.selectElement('mdc-dialog-content p')!;
  }

  get showDetails(): HTMLElement {
    return this.selectElement('mdc-dialog-content > a')!;
  }

  get stackTrace(): HTMLElement {
    return this.selectElement('pre')!;
  }

  get errorId(): HTMLElement {
    return this.selectElement('.error-id')!;
  }

  get closeButton(): HTMLElement {
    return this.selectElement('button[mdcdialogaction="close"]')!;
  }

  private selectElement(selector: string): HTMLElement | null {
    return this.overlayContainerElement.querySelector(selector);
  }
}
