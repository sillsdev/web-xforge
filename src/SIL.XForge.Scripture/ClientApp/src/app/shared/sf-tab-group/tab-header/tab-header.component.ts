import { Component, EventEmitter, HostBinding, HostListener, Input, Output } from '@angular/core';

@Component({
  selector: 'app-tab-header',
  templateUrl: './tab-header.component.html',
  styleUrls: ['./tab-header.component.scss']
})
export class TabHeaderComponent {
  @HostBinding('class.closeable')
  @Input()
  closeable = true;
  @HostBinding('class.active')
  @Input()
  active = false;
  @Output() tabClick = new EventEmitter<MouseEvent>();
  @Output() closeClick = new EventEmitter<void>();

  // Listen for left and middle clicks on the tab header
  @HostListener('click', ['$event'])
  @HostListener('auxclick', ['$event'])
  onClick(e: MouseEvent): void {
    this.tabClick.emit(e);
  }

  close(e: MouseEvent): void {
    // Stop propagation so 'tabClick' does not fire
    e.stopPropagation();
    this.closeClick.emit();
  }
}
