import {
  Directive,
  ElementRef,
  EventEmitter,
  inject,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges
} from '@angular/core';
import { ComponentProps, createElement, ElementType } from 'react';
import { createRoot, Root } from 'react-dom/client';

@Directive({
  selector: '[appRenderReact]',
  standalone: true
})
export class RenderReactDirective<Comp extends ElementType> implements OnChanges, OnDestroy {
  @Input({ required: true }) appRenderReact!: Comp;
  @Input() props?: ComponentProps<Comp>;
  @Output() rendered = new EventEmitter<void>();

  private root?: Root;
  private hostElement: HTMLElement;
  private mutationObserver?: MutationObserver;

  constructor() {
    this.hostElement = inject(ElementRef).nativeElement;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.root == null) {
      this.root = createRoot(this.hostElement);
    }

    if (changes['appRenderReact'] || changes['props']) {
      if (this.appRenderReact) {
        this.root.render(createElement(this.appRenderReact, this.props ?? {}));

        // Start observing DOM mutations to detect React render completion
        this.mutationObserver = new MutationObserver(() => {
          this.rendered.emit();
          this.mutationObserver?.disconnect();
        });

        // Observe changes in the child nodes and attributes within the rendered React component
        this.mutationObserver.observe(this.hostElement, {
          childList: true,
          subtree: true,
          attributes: true
        });
      }
    }
  }

  ngOnDestroy(): void {
    this.root?.unmount();
    this.mutationObserver?.disconnect();
  }
}
