import { AfterViewInit, Directive, ElementRef } from '@angular/core';

/**
 * Auto focuses text inputs and textarea. HTML autofocus attribute does not work for dynamically generated content.
 */
@Directive({
  selector: '[appAutofocus]',
  standalone: false
})
export class AutofocusDirective implements AfterViewInit {
  constructor(private readonly elementRef: ElementRef<HTMLElement>) {}

  ngAfterViewInit(): void {
    const hostElement: HTMLElement = this.elementRef.nativeElement;

    const input =
      hostElement instanceof HTMLInputElement || hostElement instanceof HTMLTextAreaElement
        ? hostElement
        : hostElement.querySelector('input, textarea');

    if (input instanceof HTMLElement) {
      setTimeout(() => input.focus());
    }
  }
}
