import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatChipsModule } from '@angular/material/chips';
import { I18nService } from 'xforge-common/i18n.service';

import { mock, when } from 'ts-mockito';
import { configureTestingModule } from 'xforge-common/test-utils';
import { BookMultiSelectComponent, BookOption } from './book-multi-select.component';

describe('BookMultiSelectComponent', () => {
  let component: BookMultiSelectComponent;
  let fixture: ComponentFixture<BookMultiSelectComponent>;

  const mockI18nService = mock(I18nService);
  const mockBooks: number[] = [1, 2, 3];
  const mockSelectedBooks: number[] = [1, 3];

  configureTestingModule(() => ({
    imports: [MatChipsModule],
    declarations: [BookMultiSelectComponent],
    providers: [{ provide: I18nService, useMock: mockI18nService }]
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
      { bookNum: 1, name: 'Book 1', selected: true },
      { bookNum: 2, name: 'Book 2', selected: false },
      { bookNum: 3, name: 'Book 3', selected: true }
    ];

    when(mockI18nService.localizeBook(1)).thenReturn('Book 1');
    when(mockI18nService.localizeBook(2)).thenReturn('Book 2');
    when(mockI18nService.localizeBook(3)).thenReturn('Book 3');

    component.ngOnChanges();

    expect(component.bookOptions).toEqual(mockBookOptions);
  });
});
