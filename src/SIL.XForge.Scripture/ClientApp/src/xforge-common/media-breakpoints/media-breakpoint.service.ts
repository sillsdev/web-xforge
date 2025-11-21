import { DOCUMENT, Inject, Injectable, InjectionToken } from '@angular/core';

export enum Breakpoint {
  XS,
  SM,
  MD,
  LG,
  XL,
  XXL
}

export const BREAKPOINT_CSS_VAR_PREFIX = new InjectionToken<string>('BREAKPOINT_CSS_VAR_PREFIX', {
  providedIn: 'root',
  factory: () => '--sf-breakpoint'
});

export type BreakpointComparisonOperator = '<' | '<=' | '>' | '>=';

/**
 * This service is used to generate media query strings based on breakpoints defined in CSS variables.
 * This is used in combination with the scss module `xforge-common/media-breakpoints/_breakpoints.scss`,
 * and handles the case where a breakpoint value needs to be overridden.
 */
@Injectable({
  providedIn: 'root'
})
export class MediaBreakpointService {
  private readonly rootElement: HTMLElement = this.document.documentElement;
  private readonly window: Window = this.document.defaultView!;

  constructor(
    @Inject(DOCUMENT) private readonly document: Document,
    @Inject(BREAKPOINT_CSS_VAR_PREFIX) private readonly cssVarPrefix: string
  ) {}

  /**
   * Returns a media query string that can be used in a CSS `@media` rule
   * or in a `BreakpointObserver` from `@angular/cdk/layout`.
   *
   * Compares the viewport width to the specified breakpoint using the specified comparison operator.
   *
   * Assumes that the breakpoint css variable is defined.
   *
   * ```scss
   * :root { --sf-breakpoint-sm: '576px'}  // Must be set at root level
   * element-selector { --sf-breakpoint-sm: '600px' }  // Optional override at component level
   * ```
   * ```ts
   *
   * width('>=', Breakpoint.SM); // Returns '(width >= 576px)'
   * width('<', Breakpoint.SM, element); // Returns '(width < 600px)'
   *
   * // Example usage in component
   * breakpointObserver.observe([mediaBreakpointService.width('<=', Breakpoint.SM, elementRef.nativeElement)]);
   * ```
   * @param op The comparison operator to use.
   * @param breakpoint The breakpoint to compare with.
   * @param inheritFromElement The element to inherit the css variable from. Defaults to document element.
   * @returns A media query string or an empty string if the breakpoint css variable is not defined.
   */
  width(op: BreakpointComparisonOperator, breakpoint: Breakpoint, inheritFromElement?: HTMLElement): string {
    return `(width ${op} ${this.getBreakpointValue(breakpoint, inheritFromElement)})`;
  }

  private getBreakpointValue(breakpoint: Breakpoint, element?: HTMLElement): string {
    return this.window.getComputedStyle(element ?? this.rootElement).getPropertyValue(this.getCssVarName(breakpoint));
  }

  private getCssVarName(breakpoint: Breakpoint): string {
    return `${this.cssVarPrefix}-${Breakpoint[breakpoint].toLowerCase()}`;
  }
}
