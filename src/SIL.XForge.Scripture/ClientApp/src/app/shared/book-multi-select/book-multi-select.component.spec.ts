import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatChipsModule } from '@angular/material/chips';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { BookMultiSelectComponent, BookOption } from './book-multi-select.component';

describe('BookMultiSelectComponent', () => {
  let component: BookMultiSelectComponent;
  let fixture: ComponentFixture<BookMultiSelectComponent>;

  const mockBooks: number[] = [1, 2, 3];
  const mockSelectedBooks: number[] = [1, 3];

  configureTestingModule(() => ({
    imports: [MatChipsModule, TestTranslocoModule]
  }));

  beforeEach(() => {
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
      { bookNum: 3, bookId: 'LEV', selected: true }
    ];

    component.ngOnChanges();

    expect(component.bookOptions).toEqual(mockBookOptions);
  });
});
