import { Component, EventEmitter, HostBinding, Input, Output } from '@angular/core';
import { MatRippleModule } from '@angular/material/core';
import { MatTooltipModule } from '@angular/material/tooltip';

interface ButtonColorSpec {
  hue: number;
  saturation: number;
  light: number;
  dark: number;
  hoverLight: number;
  hoverDark: number;
}

const availableColors: ButtonColorSpec[] = [
  // some are commented out because they are ugly, or too similar to others
  { hue: 0 },
  // { hue: 30, dark: 35 },
  // { hue: 60, dark: 35 },
  { hue: 90, dark: 35 },
  // { hue: 120, dark: 35 },
  // { hue: 150, dark: 35 },
  { hue: 180, dark: 35 },
  { hue: 210 },
  { hue: 240 },
  { hue: 270 },
  { hue: 300 },
  { hue: 330 }
].map(spec => {
  const dark = spec['dark'] ?? 55;
  const light = spec['light'] ?? Math.round(Math.min(dark * 1.18, 100));
  return {
    ...spec,
    dark,
    light,
    hoverLight: spec['hoverLight'] ?? Math.round(Math.min(light * 1.07, 100)),
    hoverDark: spec['hoverDark'] ?? Math.round(Math.min(dark * 1.07, 100)),
    saturation: spec['saturation'] ?? 80
  };
});

@Component({
  selector: 'app-toggle-book',
  standalone: true,
  imports: [MatTooltipModule, MatRippleModule],
  templateUrl: './toggle-book.component.html',
  styleUrl: './toggle-book.component.scss'
})
export class ToggleBookComponent {
  @Output() selectedChanged = new EventEmitter<number>();

  @HostBinding('class.selected')
  @Input()
  selected = false;

  @HostBinding('class.disabled')
  @Input()
  disabled = false;

  @Input() borderWidth = 2;
  @Input() book!: number;
  @Input() progress?: number;
  // @Input() hues: number[] = [230];

  colorSpec = availableColors[3];

  constructor() {}

  toggleSelected(): void {
    if (!this.disabled) {
      this.selected = !this.selected;
      this.selectedChanged.emit(this.book);
    }
  }

  onKeyPress(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      this.toggleSelected();
      event.preventDefault();
    }
  }

  get progressCssValue(): string {
    return `${(this.progress ?? 0) * 100}%`;
  }

  get progressColorCssValue(): string {
    return `hsl(${this.colorSpec.hue}, ${this.colorSpec.saturation}%, ${this.colorSpec.dark}%)`;
  }
  get progressColorHoverCssValue(): string {
    return `hsl(${this.colorSpec.hue}, ${this.colorSpec.saturation}%, ${this.colorSpec.hoverDark}%)`;
  }
  get progressBgColorCssValue(): string {
    return `hsl(${this.colorSpec.hue}, ${this.colorSpec.saturation}%, ${this.colorSpec.light}%)`;
  }
  get progressHoverBgColorCssValue(): string {
    return `hsl(${this.colorSpec.hue}, ${this.colorSpec.saturation}%, ${this.colorSpec.hoverLight}%)`;
  }

  get progressDescription(): string {
    if (this.progress == null) return '';

    // avoid showing 100% when it's not quite there
    let percent = this.progress > 0.99 && this.progress < 1 ? 99 : Math.round(this.progress * 100);
    return this.progress != null ? `${Math.round(percent)}% translated` : '';
  }
}
