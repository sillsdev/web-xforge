import { ComponentFixture, TestBed } from '@angular/core/testing';
import { anything, mock, when } from 'ts-mockito';
import { I18nService } from 'xforge-common/i18n.service';
import { configureTestingModule, getTestTranslocoModule } from 'xforge-common/test-utils';
import { ProgressService, ProjectProgress } from '../progress-service/progress.service';
import { Book } from './book-multi-select';
import { BookMultiSelectComponent } from './book-multi-select.component';

const mockedProgressService = mock(ProgressService);
const mockedI18nService = mock(I18nService);

describe('BookMultiSelectComponent', () => {
  let component: BookMultiSelectComponent;
  let fixture: ComponentFixture<BookMultiSelectComponent>;

  let mockBooks: Book[];
  let mockSelectedBooks: Book[];

  configureTestingModule(() => ({
    imports: [getTestTranslocoModule()],
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
    when(mockedProgressService.getProgress(anything(), anything())).thenResolve(
      new ProjectProgress([
        { bookId: 'GEN', verseSegments: 0, blankVerseSegments: 0 },
        { bookId: 'EXO', verseSegments: 10_000, blankVerseSegments: 8_500 },
        { bookId: 'LEV', verseSegments: 10_000, blankVerseSegments: 7_000 },
        { bookId: 'MAT', verseSegments: 10_000, blankVerseSegments: 5_500 },
        { bookId: 'LUK', verseSegments: 10_000, blankVerseSegments: 4_000 },
        { bookId: 'TOB', verseSegments: 10_000, blankVerseSegments: 2_000 },
        { bookId: 'WIS', verseSegments: 10_000, blankVerseSegments: 0 }
      ])
    );
    when(mockedI18nService.localeCode).thenReturn('en');

    fixture = TestBed.createComponent(BookMultiSelectComponent);
    component = fixture.componentInstance;
    component.availableBooks = mockBooks;
    component.selectedBooks = mockSelectedBooks;
    component.projectId = 'test-project-id';
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
    when(mockedProgressService.getProgress(anything(), anything())).thenResolve(new ProjectProgress([]));
    await component.ngOnChanges();

    expect(component.bookOptions).toEqual([
      { bookNum: 1, bookId: 'GEN', selected: true, progressPercentage: null },
      { bookNum: 2, bookId: 'EXO', selected: false, progressPercentage: null },
      { bookNum: 3, bookId: 'LEV', selected: true, progressPercentage: null },
      { bookNum: 40, bookId: 'MAT', selected: false, progressPercentage: null },
      { bookNum: 42, bookId: 'LUK', selected: false, progressPercentage: null },
      { bookNum: 67, bookId: 'TOB', selected: false, progressPercentage: null },
      { bookNum: 70, bookId: 'WIS', selected: false, progressPercentage: null }
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
