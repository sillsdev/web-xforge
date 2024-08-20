import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatRippleModule } from '@angular/material/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoModule } from '@ngneat/transloco';
import { I18nService } from '../../../../xforge-common/i18n.service';

@Component({
  selector: 'app-toggle-book',
  standalone: true,
  imports: [TranslocoModule, MatTooltipModule, MatRippleModule],
  templateUrl: './toggle-book.component.html',
  styleUrl: './toggle-book.component.scss'
})
export class ToggleBookComponent {
  @Output() selectedChanged = new EventEmitter<number>();
  @Input() selected = false;
  @Input() disabled = false;
  @Input() borderWidth = 2;
  @Input() book!: number;
  @Input() progress?: number;
  @Input() hues: number[] = [230];

  constructor(private readonly i18n: I18nService) {}

  bookName(book: number): string {
    return this.i18n.localizeBook(book);
  }

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

  get backgroundCssGradientStripes(): string {
    const percentPerStripe = 12.5;
    const colors = this.hues.map(hue => `hsl(${hue}, 80%, 60%)`);
    let gradient = [];
    for (const [index, color] of colors.entries()) {
      const from = index * percentPerStripe;
      const to = (index + 1) * percentPerStripe;
      gradient.push(`${color} ${from}%, ${color} ${to}%`);
    }
    return `repeating-linear-gradient(135deg, ${gradient.join(', ')})`;
  }

  get progressCssValue(): string {
    return `${(this.progress ?? 0) * 100}%`;
  }

  get borderWidthCssValue(): string {
    return `${this.borderWidth}px`;
  }

  get progressDescription(): string {
    if (this.progress == null) return '';

    // avoid showing 100% when it's not quite there
    let percent = this.progress > 0.99 && this.progress < 1 ? 99 : Math.round(this.progress * 100);
    return this.progress != null ? `${Math.round(percent)}% translated` : '';
  }
}
