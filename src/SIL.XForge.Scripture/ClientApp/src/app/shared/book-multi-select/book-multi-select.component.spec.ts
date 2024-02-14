import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatChipsModule } from '@angular/material/chips';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { BookMultiSelectComponent, BookOption } from './book-multi-select.component';

describe('BookMultiSelectComponent', () => {
  let component: BookMultiSelectComponent;
  let fixture: ComponentFixture<BookMultiSelectComponent>;

  let mockBooks: number[];
  let mockSelectedBooks: number[];

  configureTestingModule(() => ({
    imports: [MatChipsModule, TestTranslocoModule]
  }));

  beforeEach(() => {
    mockBooks = [1, 2, 3, 42, 70];
    mockSelectedBooks = [1, 3];
    fixture = TestBed.createComponent(BookMultiSelectComponent);
    component = fixture.componentInstance;
    component.availableBooks = mockBooks;
    component.selectedBooks = mockSelectedBooks;
    fixture.detectChanges();
  });

  it('should initialize book options on ngOnChanges', () => {
    const mockBookOptions: BookOption[] = [
      { bookNum: 1, bookId: 'GEN', selected: true },
      { bookNum: 2, bookId: 'EXO', selected: false },
      { bookNum: 3, bookId: 'LEV', selected: true },
      { bookNum: 42, bookId: 'LUK', selected: false },
      { bookNum: 70, bookId: 'WIS', selected: false }
    ];

    component.ngOnChanges();

    expect(component.bookOptions).toEqual(mockBookOptions);
  });

  it('can select all OT books', () => {
    expect(component.selectedBooks.length).toEqual(2);

    component.select('OT');

    expect(component.selectedBooks.length).toEqual(3);
  });

  it('can select all NT books', () => {
    expect(component.selectedBooks.length).toEqual(2);

    component.select('NT');

    expect(component.selectedBooks.length).toEqual(3);
  });

  it('can select all DC books', () => {
    expect(component.selectedBooks.length).toEqual(2);

    component.select('DC');

    expect(component.selectedBooks.length).toEqual(3);
  });

  it('can reset book selection', () => {
    expect(component.selectedBooks.length).toEqual(2);

    component.clear();

    expect(component.selectedBooks.length).toEqual(0);
  });
});
