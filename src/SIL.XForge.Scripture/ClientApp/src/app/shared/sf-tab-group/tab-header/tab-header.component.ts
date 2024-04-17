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

  @HostBinding('class.movable')
  @Input()
  movable = true;

  @HostBinding('class.active')
  @Input()
  active = false;

  @Output() tabPress = new EventEmitter<MouseEvent | TouchEvent>();
  @Output() tabClick = new EventEmitter<MouseEvent | TouchEvent>();
  @Output() closeClick = new EventEmitter<void>();

  @HostListener('mousedown', ['$event'])
  @HostListener('touchstart', ['$event'])
  onPress(e: MouseEvent | TouchEvent): void {
    this.tabPress.emit(e);
  }

  // Listen for left and middle clicks on the tab header
  @HostListener('click', ['$event'])
  @HostListener('auxclick', ['$event'])
  onClick(e: MouseEvent | TouchEvent): void {
    this.tabClick.emit(e);
  }

  onCloseClick(e: Event): void {
    // Stop propagation so 'tabClick' does not fire
    e.stopPropagation();

    this.closeClick.emit();
  }

  onClosePress(e: Event): void {
    // Stop propagation so 'tabPress' does not fire
    e.stopPropagation();
  }
}
