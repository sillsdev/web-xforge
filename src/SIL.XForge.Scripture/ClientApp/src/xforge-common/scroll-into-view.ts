import { AfterViewInit, Directive, ElementRef } from '@angular/core';

@Directive({
  selector: '[appScrollIntoView]'
})
export class ScrollIntoViewDirective implements AfterViewInit {
  constructor(private readonly elementRef: ElementRef<HTMLElement>) {}

  ngAfterViewInit() {
    setTimeout(() => this.scrollIntoViewIfNeeded(this.elementRef.nativeElement), 0);
  }

  private scrollIntoViewIfNeeded(element: HTMLElement) {
    const scrollElement = this.nearestScrollingAncestor(element);
    const padding = 5;
    if (scrollElement) {
      let insufficientScroll = element.getBoundingClientRect().bottom - scrollElement.getBoundingClientRect().bottom;
      insufficientScroll += padding;
      if (insufficientScroll > 0) {
        scrollElement.scrollBy(0, insufficientScroll);
      } else {
        let excessiveScroll = scrollElement.getBoundingClientRect().top - element.getBoundingClientRect().top;
        excessiveScroll += padding;
        if (excessiveScroll > 0) {
          scrollElement.scrollBy(0, -excessiveScroll);
        }
      }
    }
  }

  private nearestScrollingAncestor(element: HTMLElement): HTMLElement | null {
    const parent = element.parentElement;
    if (parent == null) {
      return null;
    } else if (
      parent.scrollHeight > parent.clientHeight &&
      ['scroll', 'auto'].includes(window.getComputedStyle(parent).overflowY as string)
    ) {
      return parent;
    } else {
      return this.nearestScrollingAncestor(parent);
    }
  }
}
