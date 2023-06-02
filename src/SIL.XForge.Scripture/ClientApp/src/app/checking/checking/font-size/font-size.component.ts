import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';

@Component({
  selector: 'app-font-size',
  templateUrl: './font-size.component.html',
  styleUrls: ['./font-size.component.scss']
})
export class FontSizeComponent implements OnInit {
  @Input() min: number = 1;
  @Input() max: number = 3;
  @Output() apply = new EventEmitter<string>();

  step: number = 0.1;
  initial: number = 1;

  fontSize!: number;

  constructor() {}

  ngOnInit(): void {
    if (this.min > this.max) {
      throw new RangeError(`min (${this.min}) can not be larger than max (${this.max})`);
    }

    this.fontSize = this.initial;
    this.enforceBounds();
    this.applySize();
  }

  applySize(): void {
    this.apply.emit(this.fontSize + 'rem');
  }

  enforceBounds(): void {
    if (this.fontSize < this.min) {
      this.fontSize = this.min;
    }
    if (this.fontSize > this.max) {
      this.fontSize = this.max;
    }
  }

  adjustFontSize($event: Event, direction: 1 | -1): void {
    this.fontSize += direction * this.step;
    this.enforceBounds();
    this.applySize();

    // Ensure focus removed from element if disabled (firefox doesn't)
    if (this.fontSize === this.min) {
      ($event.target as HTMLElement).closest('button')?.blur();
    }

    // Allows menu to stay open
    $event.stopPropagation();
  }
}
