import { Directive, ElementRef, HostBinding, HostListener, Inject, Input } from '@angular/core';
import { ActivatedRoute, NavigationExtras, Router } from '@angular/router';
import { WINDOW } from './browser-globals';

@Directive({
  selector: '[appRouterLink]'
})
export class RouterDirective {
  private _route!: string[];

  constructor(
    private element: ElementRef,
    private router: Router,
    private currentRoute: ActivatedRoute,
    @Inject(WINDOW) private window: Window
  ) {}

  @Input() set appRouterLink(value: string | string[]) {
    this._route = Array.isArray(value) ? value : [value];
    if (this.isLink) {
      (this.element.nativeElement as HTMLElement).setAttribute('href', this.url);
    }
  }

  get route(): string[] {
    return this._route;
  }

  @HostBinding('class.activated-nav-item')
  get active(): boolean {
    return (
      (this.element.nativeElement as HTMLElement).classList.contains('mat-list-item') && this.router.url === this.url
    );
  }

  @HostListener('click', ['$event'])
  onClick(event: MouseEvent) {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      this.window.open(this.url, '_blank', 'noopener');
    } else {
      this.router.navigate(this.route, this.routerOptions);
    }
  }

  @HostListener('mouseup', ['$event'])
  onMouseUp(event: MouseEvent) {
    // if it's the middle mouse button
    // (but not an <a> tag, because preventDefault doesn't stop it from opening a new tab)
    if (event.button === 1 && !this.isLink) {
      event.preventDefault();
      this.window.open(this.url, '_blank', 'noopener');
    }
  }

  private get url(): string {
    return this.router.createUrlTree(this.route, this.routerOptions).toString();
  }

  private get routerOptions(): NavigationExtras {
    const isRelativeRoute = this.route[0][0] !== '/';
    return { relativeTo: isRelativeRoute ? this.currentRoute : null };
  }

  private get isLink(): boolean {
    return (this.element.nativeElement as HTMLElement).tagName === 'A';
  }
}
