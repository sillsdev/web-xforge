import { MdcTextField } from '@angular-mdc/web';
import { AfterViewInit, Directive } from '@angular/core';

/**
 * Auto focuses MdcTextField and MdcTextarea. HTML autofocus attribute does not work for dynamically generated content.
 */
@Directive({
  selector: '[appAutofocus]'
})
export class AutofocusDirective implements AfterViewInit {
  constructor(private readonly component: MdcTextField) {}

  ngAfterViewInit() {
    setTimeout(() => this.component.focus(), 0);
  }
}
