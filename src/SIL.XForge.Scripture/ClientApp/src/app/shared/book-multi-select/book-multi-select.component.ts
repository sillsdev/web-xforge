import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { MatChipListboxChange, MatChipsModule } from '@angular/material/chips';
import { TranslocoModule } from '@ngneat/transloco';
import { Canon } from '@sillsdev/scripture';
import { UICommonModule } from 'xforge-common/ui-common.module';

export interface BookOption {
  bookNum: number;
  bookId: string;
  selected: boolean;
}

@Component({
  selector: 'app-book-multi-select',
  templateUrl: './book-multi-select.component.html',
  standalone: true,
  imports: [CommonModule, UICommonModule, MatChipsModule, TranslocoModule],
  styleUrls: ['./book-multi-select.component.scss']
})
export class BookMultiSelectComponent implements OnChanges {
  @Input() availableBooks: number[] = [];
  @Input() selectedBooks: number[] = [];
  @Input() readonly: boolean = false;
  @Output() bookSelect = new EventEmitter<number[]>();

  bookOptions: BookOption[] = [];

  selection: any = '';

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
    this.selection = undefined;
    this.bookSelect.emit(this.selectedBooks);
  }

  select(eventValue: string): void {
    if (eventValue === 'OT') {
      this.selectedBooks.push(
        ...this.availableBooks.filter(n => Canon.isBookOT(n) && this.selectedBooks.indexOf(n) === -1)
      );
    } else if (eventValue === 'NT') {
      this.selectedBooks.push(
        ...this.availableBooks.filter(n => Canon.isBookNT(n) && this.selectedBooks.indexOf(n) === -1)
      );
    } else if (eventValue === 'DC') {
      this.selectedBooks.push(
        ...this.availableBooks.filter(n => Canon.isBookDC(n) && this.selectedBooks.indexOf(n) === -1)
      );
    }
    this.initBookOptions();
    this.bookSelect.emit(this.selectedBooks);
  }

  clear(): void {
    this.selectedBooks.length = 0;
    this.selection = undefined;
    this.initBookOptions();
    this.bookSelect.emit(this.selectedBooks);
  }

  isOldTestamentAvailable(): boolean {
    return this.availableBooks.findIndex(n => Canon.isBookOT(n)) > -1;
  }

  isNewTestamentAvailable(): boolean {
    return this.availableBooks.findIndex(n => Canon.isBookNT(n)) > -1;
  }

  isDeuterocanonAvailable(): boolean {
    return this.availableBooks.findIndex(n => Canon.isBookDC(n)) > -1;
  }
}
