import { AfterViewInit, Directive, ElementRef } from '@angular/core';

/**
 * Auto focuses text inputs and textarea. HTML autofocus attribute does not work for dynamically generated content.
 */
@Directive({
  selector: '[appAutofocus]'
})
export class AutofocusDirective implements AfterViewInit {
  constructor(private readonly elementRef: ElementRef) {}

  ngAfterViewInit(): void {
    const hostElement = this.elementRef.nativeElement;
    const input = hostElement instanceof HTMLInputElement ? hostElement : hostElement.querySelector('input, textarea');

    if (input) {
      setTimeout(() => input.focus());
    }
  }
}
