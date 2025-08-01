import { Directive, ElementRef, HostListener } from '@angular/core';

@Directive({
  selector: 'button[appBlurOnClick]',
  standalone: false
})
export class BlurOnClickDirective {
  constructor(private readonly elementRef: ElementRef<HTMLElement>) {}

  @HostListener('click')
  handleClick(): void {
    this.elementRef.nativeElement.blur();
  }
}
