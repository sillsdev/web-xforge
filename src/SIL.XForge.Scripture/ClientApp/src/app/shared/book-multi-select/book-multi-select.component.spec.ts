import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { mock, when } from 'ts-mockito';
import { I18nService } from 'xforge-common/i18n.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { Book } from '../../translate/draft-generation/draft-generation-steps/draft-generation-steps.component';
import { ProgressService, TextProgress } from '../progress-service/progress.service';
import { BookMultiSelectComponent } from './book-multi-select.component';

const mockedProgressService = mock(ProgressService);
const mockedI18nService = mock(I18nService);

describe('BookMultiSelectComponent', () => {
  let component: BookMultiSelectComponent;
  let fixture: ComponentFixture<BookMultiSelectComponent>;

  let mockBooks: Book[];
  let mockSelectedBooks: Book[];

  configureTestingModule(() => ({
    imports: [TestTranslocoModule],
    providers: [
      { provide: ProgressService, useMock: mockedProgressService },
      { provide: I18nService, useMock: mockedI18nService }
    ]
  }));

  function book(bookNum: number): Book {
    return { number: bookNum, selected: false };
  }

  beforeEach(() => {
    mockBooks = [book(1), book(2), book(3), book(40), book(42), book(67), book(70)];
    mockSelectedBooks = [
      { number: 1, selected: true },
      { number: 3, selected: true }
    ];
    when(mockedProgressService.isLoaded$).thenReturn(of(true));
    when(mockedProgressService.texts).thenReturn([
      { text: { bookNum: 1 }, percentage: 0 } as TextProgress,
      { text: { bookNum: 2 }, percentage: 15 } as TextProgress,
      { text: { bookNum: 3 }, percentage: 30 } as TextProgress,
      { text: { bookNum: 40 }, percentage: 45 } as TextProgress,
      { text: { bookNum: 42 }, percentage: 60 } as TextProgress,
      { text: { bookNum: 67 }, percentage: 80 } as TextProgress,
      { text: { bookNum: 70 }, percentage: 100 } as TextProgress
    ]);
    when(mockedI18nService.localeCode).thenReturn('en');

    fixture = TestBed.createComponent(BookMultiSelectComponent);
    component = fixture.componentInstance;
    component.availableBooks = mockBooks;
    component.selectedBooks = mockSelectedBooks;
    fixture.detectChanges();
  });

  it('supports providing project name', async () => {
    await component.ngOnChanges();
    expect(fixture.nativeElement.querySelector('.project-name')).toBeNull();
    component.projectName = 'Test Project';
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.project-name')).not.toBeNull();
  });

  it('should initialize book options on ngOnChanges', async () => {
    await component.ngOnChanges();
    expect(component.bookOptions).toEqual([
      { bookNum: 1, bookId: 'GEN', selected: true, progressPercentage: 0 },
      { bookNum: 2, bookId: 'EXO', selected: false, progressPercentage: 15 },
      { bookNum: 3, bookId: 'LEV', selected: true, progressPercentage: 30 },
      { bookNum: 40, bookId: 'MAT', selected: false, progressPercentage: 45 },
      { bookNum: 42, bookId: 'LUK', selected: false, progressPercentage: 60 },
      { bookNum: 67, bookId: 'TOB', selected: false, progressPercentage: 80 },
      { bookNum: 70, bookId: 'WIS', selected: false, progressPercentage: 100 }
    ]);
  });

  it('should not crash when texts have not yet loaded', async () => {
    when(mockedProgressService.texts).thenReturn([]);
    await component.ngOnChanges();

    expect(component.bookOptions).toEqual([
      { bookNum: 1, bookId: 'GEN', selected: true, progressPercentage: 0 },
      { bookNum: 2, bookId: 'EXO', selected: false, progressPercentage: 0 },
      { bookNum: 3, bookId: 'LEV', selected: true, progressPercentage: 0 },
      { bookNum: 40, bookId: 'MAT', selected: false, progressPercentage: 0 },
      { bookNum: 42, bookId: 'LUK', selected: false, progressPercentage: 0 },
      { bookNum: 67, bookId: 'TOB', selected: false, progressPercentage: 0 },
      { bookNum: 70, bookId: 'WIS', selected: false, progressPercentage: 0 }
    ]);
  });

  it('can select all OT books and clear all OT books', async () => {
    expect(component.selectedBooks.length).toEqual(2);

    await component.select('OT', true);
    expect(component.selectedBooks.length).toEqual(3);

    await component.select('OT', false);
    expect(component.selectedBooks.length).toEqual(0);
  });

  it('can select all NT books and clear all NT books', async () => {
    expect(component.selectedBooks.length).toEqual(2);

    await component.select('NT', true);
    expect(component.selectedBooks.length).toEqual(4);

    await component.select('NT', false);
    expect(component.selectedBooks.length).toEqual(2);
  });

  it('can select all DC books and clear all DC books', async () => {
    expect(component.selectedBooks.length).toEqual(2);

    await component.select('DC', true);
    expect(component.selectedBooks.length).toEqual(4);

    await component.select('DC', false);
    expect(component.selectedBooks.length).toEqual(2);
  });

  it('should show checkboxes for OT, NT, and DC as indeterminate when only some books from that category are selected', async () => {
    await component.select('OT', false);
    component.selectedBooks = [{ number: 1, selected: true }];
    await component.ngOnChanges();
    fixture.detectChanges();

    expect(component.partialOT).toBe(true);
    expect(component.partialNT).toBe(false);
    expect(component.partialDC).toBe(false);

    await component.select('OT', false);
    component.selectedBooks = [{ number: 40, selected: true }];
    await component.ngOnChanges();
    fixture.detectChanges();

    expect(component.partialOT).toBe(false);
    expect(component.partialNT).toBe(true);
    expect(component.partialDC).toBe(false);

    await component.select('NT', false);
    component.selectedBooks = [{ number: 67, selected: true }];
    await component.ngOnChanges();
    fixture.detectChanges();

    expect(component.partialOT).toBe(false);
    expect(component.partialOT).toBe(false);
    expect(component.partialDC).toBe(true);
  });

  it('can hide checkboxes and progress in basic mode', async () => {
    await component.ngOnChanges();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.book-multi-select .border-fill')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.scope-selection')).not.toBeNull();
    component.basicMode = true;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.book-multi-select .border-fill')).toBeNull();
    expect(fixture.nativeElement.querySelector('.scope-selection')).toBeNull();
  });
});
