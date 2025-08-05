/* eslint-disable @angular-eslint/directive-selector */
import { Directive, ElementRef, OnInit, Renderer2 } from '@angular/core';

/**
 * Directive to add bubble animation to a button. Inspired by https://codepen.io/nourabusoud/pen/ypZzMM,
 * but modified to use an inner `<span>` to attach the pseudo elements to so as not to conflict
 * with other styles or components that use `::before` or `::after` such as Angular Material components.
 */
@Directive({
  selector: '[sfBubbleButton]'
})
export class BubbleButtonDirective implements OnInit {
  cssInnerSpanStyleClass = 'sf-bubble-button-elements';
  cssButtonStyleClass = 'sf-bubble-button';
  cssButtonAnimationClass = 'sf-bubble-animate';

  constructor(
    private readonly el: ElementRef,
    private readonly renderer: Renderer2
  ) {}

  ngOnInit(): void {
    const hostElement = this.el.nativeElement;
    const innerSpan = this.renderer.createElement('span');

    // Add inner span to host element
    this.renderer.addClass(innerSpan, this.cssInnerSpanStyleClass);
    this.renderer.appendChild(hostElement, innerSpan);

    // Add class and click listener to host element
    this.renderer.addClass(hostElement, this.cssButtonStyleClass);
    this.renderer.listen(hostElement, 'click', () => {
      // Add animation class to inner span
      this.addAnimationClass(innerSpan);
    });
  }

  // Adds animation class to the element and removes it after animation is complete
  addAnimationClass(el: any): void {
    // Reset animation
    el.classList.remove(this.cssButtonAnimationClass);

    // Timeout needed to restart animation
    setTimeout(() => {
      el.classList.add(this.cssButtonAnimationClass);
    }, 10);
  }
}
