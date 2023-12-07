import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { MatChipListboxChange, MatChipsModule } from '@angular/material/chips';
import { TranslocoModule } from '@ngneat/transloco';
import { Canon } from '@sillsdev/scripture';

export interface BookOption {
  bookNum: number;
  bookId: string;
  selected: boolean;
}

@Component({
  selector: 'app-book-multi-select',
  templateUrl: './book-multi-select.component.html',
  standalone: true,
  imports: [CommonModule, MatChipsModule, TranslocoModule],
  styleUrls: ['./book-multi-select.component.scss']
})
export class BookMultiSelectComponent implements OnChanges {
  @Input() availableBooks: number[] = [];
  @Input() selectedBooks: number[] = [];
  @Input() readonly: boolean = false;
  @Output() bookSelect = new EventEmitter<number[]>();

  bookOptions: BookOption[] = [];

  ngOnChanges(): void {
    this.initBookOptions();
  }

  initBookOptions(): void {
    const selectedSet = new Set<number>(this.selectedBooks);

    this.bookOptions = this.availableBooks.map((bookNum: number) => ({
      bookNum,
      bookId: Canon.bookNumberToId(bookNum),
      selected: selectedSet.has(bookNum)
    }));
  }

  onChipListChange(event: MatChipListboxChange): void {
    this.selectedBooks = event.value.map((item: BookOption) => item.bookNum);
    this.bookSelect.emit(this.selectedBooks);
  }
}
