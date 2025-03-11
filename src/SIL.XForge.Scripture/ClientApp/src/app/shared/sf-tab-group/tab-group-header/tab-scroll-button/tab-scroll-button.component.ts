import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, EventEmitter, HostBinding, Inject, Input, OnInit, Output } from '@angular/core';
import { BehaviorSubject, distinctUntilChanged, fromEvent, merge } from 'rxjs';
import { quietTakeUntilDestroyed } from 'xforge-common/utils';

@Component({
  selector: 'app-tab-scroll-button',
  templateUrl: './tab-scroll-button.component.html',
  styleUrls: ['./tab-scroll-button.component.scss']
})
export class TabScrollButtonComponent implements OnInit {
  @Input() disabled = false;
  @Input()
  @HostBinding('class')
  side: 'start' | 'end' = 'end';

  @Output() scrollStart = new EventEmitter<void>();
  @Output() scrollStop = new EventEmitter<void>();

  isMouseDown = false;
  scroll$ = new BehaviorSubject(false);

  constructor(
    private readonly destroyRef: DestroyRef,
    @Inject(DOCUMENT) private readonly document: Document
  ) {}

  ngOnInit(): void {
    // Stop button scrolling on mouseup or when mouse leaves the document
    merge(fromEvent(this.document, 'mouseup'), fromEvent(this.document, 'mouseleave'))
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.isMouseDown = false;
        this.scroll$.next(false);
      });

    this.scroll$.pipe(quietTakeUntilDestroyed(this.destroyRef), distinctUntilChanged()).subscribe(scroll => {
      if (scroll) {
        this.scrollStart.emit();
      } else {
        this.scrollStop.emit();
      }
    });
  }

  onMouseDown(): void {
    this.isMouseDown = true;
    this.scroll$.next(true);
  }

  onMouseEnter(): void {
    if (this.isMouseDown) {
      this.scroll$.next(true);
    }
  }

  onMouseLeave(): void {
    this.scroll$.next(false);
  }
}
