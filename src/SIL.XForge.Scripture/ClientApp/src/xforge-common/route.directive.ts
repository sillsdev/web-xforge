import { Directive, ElementRef, HostBinding, HostListener, Inject, Input } from '@angular/core';
import { Router } from '@angular/router';
import { WINDOW } from './browser-globals';

@Directive({
  selector: '[appRouterLink]'
})
export class RouterDirective {
  private _route!: string | string[];

  constructor(private element: ElementRef, private router: Router, @Inject(WINDOW) private window: Window) {}

  @Input('appRouterLink')
  set route(value: string | string[]) {
    this._route = value;
    const element = this.element!.nativeElement as HTMLElement;
    if (this.isLink) {
      element.setAttribute('href', this.url);
    }
  }

  get route() {
    return this._route;
  }

  @HostBinding('class.mdc-list-item--activated')
  get active(): boolean {
    return (this.element.nativeElement as HTMLElement).tagName === 'MDC-LIST-ITEM' && this.router.url === this.url;
  }

  @HostListener('click', ['$event'])
  onClick(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (event.ctrlKey || event.metaKey) {
      this.window.open(this.url, '_blank', 'noopener');
    } else {
      this.router.navigate(Array.isArray(this.route) ? this.route : [this.route]);
    }
  }

  @HostListener('mouseup', ['$event'])
  onMouseUp(event: MouseEvent) {
    // if it's the middle mouse button (but not an a tag, because preventDefault doesn't stop it from opening a new tab)
    if (event.which === 2 && !this.isLink) {
      event.preventDefault();
      event.stopPropagation();
      this.window.open(this.url, '_blank', 'noopener');
    }
  }

  private get url(): string {
    return Array.isArray(this.route) ? this.route.join('/') : this.route;
  }

  private get isLink(): boolean {
    return (this.element.nativeElement as HTMLElement).tagName === 'A';
  }
}
