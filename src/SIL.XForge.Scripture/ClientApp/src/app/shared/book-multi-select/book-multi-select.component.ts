import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { I18nService } from 'xforge-common/i18n.service';

export interface BookOption {
  bookNum: number;
  name: string;
  selected: boolean;
}

@Component({
  selector: 'app-book-multi-select',
  templateUrl: './book-multi-select.component.html',
  styleUrls: ['./book-multi-select.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BookMultiSelectComponent implements OnChanges {
  @Input() availableBooks: number[] = [];
  @Input() selectedBooks: number[] = [];
  @Input() readonly: boolean = false;
  @Output() bookSelect = new EventEmitter<number[]>();

  bookOptions: BookOption[] = [];

  constructor(private i18n: I18nService) {}

  ngOnChanges(): void {
    // Update book list
    this.initBookOptions();
  }

  initBookOptions(): void {
    this.bookOptions = this.availableBooks.map((bookNum: number) => ({
      bookNum,
      name: this.i18n.localizeBook(bookNum),
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
