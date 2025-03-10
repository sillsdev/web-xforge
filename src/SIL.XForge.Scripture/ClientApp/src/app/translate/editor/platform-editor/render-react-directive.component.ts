import { Directive, ElementRef, inject, Input, OnChanges, OnDestroy } from '@angular/core';
import { ComponentProps, createElement, ElementType } from 'react';
import { createRoot } from 'react-dom/client';

@Directive({
  selector: '[appRenderReact]',
  standalone: true
})
export class RenderReactDirective<Comp extends ElementType> implements OnChanges, OnDestroy {
  @Input({ required: true }) appRenderReact!: Comp;
  @Input() props?: ComponentProps<Comp>;

  private root = createRoot(inject(ElementRef).nativeElement);

  ngOnChanges(): void {
    this.root.render(createElement(this.appRenderReact, this.props));
  }

  ngOnDestroy(): void {
    this.root.unmount();
  }
}
