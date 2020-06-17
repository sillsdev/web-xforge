import { MdcTextarea, MdcTextField } from '@angular-mdc/web/textfield';
import { AfterViewInit, Directive, Host, Optional, Self } from '@angular/core';

/**
 * Auto focuses MdcTextField and MdcTextarea. HTML autofocus attribute does not work for dynamically generated content.
 */
@Directive({
  selector: '[appAutofocus]'
})
export class AutofocusDirective implements AfterViewInit {
  private component: { focus: () => void };

  // Angular allows injecting the component or element but doesn't have a good way to handle components of variable type
  // See https://github.com/angular/angular/issues/8277#issuecomment-323678013 for this workaround
  constructor(@Host() @Self() @Optional() textField: MdcTextField, @Host() @Self() @Optional() textArea: MdcTextarea) {
    this.component = (textField || textArea)!;
  }

  ngAfterViewInit() {
    setTimeout(() => this.component.focus(), 0);
  }
}
