import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { Canon } from '@sillsdev/scripture';

export interface BookOption {
  bookNum: number;
  bookId: string;
  selected: boolean;
}

@Component({
  selector: 'app-book-multi-select',
  templateUrl: './book-multi-select.component.html',
  styleUrls: ['./book-multi-select.component.scss']
})
export class BookMultiSelectComponent implements OnChanges {
  @Input() availableBooks: number[] = [];
  @Input() selectedBooks: number[] = [];
  @Input() readonly: boolean = false;
  @Output() bookSelect = new EventEmitter<number[]>();

  bookOptions: BookOption[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    // Ignore the first change, which is array initialization to empty array
    if (!changes.availableBooks?.firstChange) {
      this.initBookOptions();
    }
  }

  initBookOptions(): void {
    this.bookOptions = this.availableBooks.map((bookNum: number) => ({
      bookNum,
      bookId: Canon.bookNumberToId(bookNum),
      selected: this.selectedBooks?.includes(bookNum) ?? false
    }));
  }

  toggleSelection(book: BookOption): void {
    book.selected = !book.selected;
    this.bookSelect.emit(
      this.bookOptions.filter((opt: BookOption) => opt.selected).map((opt: BookOption) => opt.bookNum)
    );
  }
}
