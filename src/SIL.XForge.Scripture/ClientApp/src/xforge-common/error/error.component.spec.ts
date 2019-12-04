import { MdcDialog, MdcDialogConfig } from '@angular-mdc/web/dialog';
import { OverlayContainer } from '@angular/cdk/overlay';
import { CommonModule } from '@angular/common';
import { Component, Directive, NgModule, ViewChild, ViewContainerRef } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
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

    env.showDetails.click();
    env.fixture.detectChanges();
    expect(env.showDetails.textContent).toBe('Hide details');
    expect(env.stackTrace.style.display).not.toBe('none');
    expect(env.stackTrace.textContent).toBe('The error stack');

    env.showDetails.click();
    env.fixture.detectChanges();
    expect(env.showDetails.textContent).toBe('Show details');
    expect(env.stackTrace.style.display).toBe('none');
  }));

  it('should only offer to show more when a stack trace is available', fakeAsync(() => {
    const env = new TestEnvironment({
      message: 'Testing without stack',
      eventId: '1'
    });

    expect(env.errorMessage.textContent).toBe('Testing without stack');
    expect(env.showDetails.style.display).toBe('none');
    expect(env.stackTrace.style.display).toBe('none');
  }));

  it('should correctly generate links', fakeAsync(() => {
    const errorComponent = new ErrorComponent(null as any, null as any);
    expect(errorComponent.getLinkHTML('example', 'https://example.com')).toEqual(
      `<a href="https://example.com" target="_blank">example</a>`
    );
  }));
});

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
  @ViewChild(ViewContainerDirective, { static: true }) viewContainer!: ViewContainerDirective;

  get childViewContainer(): ViewContainerRef {
    return this.viewContainer.viewContainerRef;
  }
}

@NgModule({
  imports: [CommonModule, UICommonModule, TestTranslocoModule],
  declarations: [ViewContainerDirective, ChildViewContainerComponent, ErrorComponent],
  exports: [ViewContainerDirective, ChildViewContainerComponent, ErrorComponent],
  entryComponents: [ChildViewContainerComponent, ErrorComponent]
})
class DialogTestModule {}

class TestEnvironment {
  readonly fixture: ComponentFixture<ChildViewContainerComponent>;
  readonly element: HTMLElement;

  constructor(dialogData: ErrorAlert) {
    this.fixture = TestBed.createComponent(ChildViewContainerComponent);
    this.element = TestBed.get(OverlayContainer).getContainerElement();
    const viewContainerRef = this.fixture.componentInstance.childViewContainer;
    const config: MdcDialogConfig<ErrorAlert> = {
      data: dialogData,
      viewContainerRef
    };
    TestBed.get(MdcDialog).open(ErrorComponent, config);
    this.fixture.detectChanges();
    // open dialog animation
    tick(166);
  }

  get errorMessage(): HTMLElement {
    return this.element.querySelector('mdc-dialog-content p') as HTMLElement;
  }

  get showDetails(): HTMLElement {
    return this.element.querySelector('mdc-dialog-content > a') as HTMLElement;
  }

  get stackTrace(): HTMLElement {
    return this.element.querySelector('pre') as HTMLElement;
  }

  get closeButton(): HTMLElement {
    return this.element.querySelector('button') as HTMLElement;
  }
}
