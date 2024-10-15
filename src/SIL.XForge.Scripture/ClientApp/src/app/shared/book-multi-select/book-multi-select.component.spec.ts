import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatChipsModule } from '@angular/material/chips';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { mock, when } from 'ts-mockito';
import { TestTranslocoModule, configureTestingModule } from 'xforge-common/test-utils';
import { ProgressService, TextProgress } from '../progress-service/progress.service';
import { BookMultiSelectComponent } from './book-multi-select.component';

const mockedActivatedRoute = mock(ActivatedRoute);
const mockedProgressService = mock(ProgressService);

describe('BookMultiSelectComponent', () => {
  let component: BookMultiSelectComponent;
  let fixture: ComponentFixture<BookMultiSelectComponent>;

  let mockBooks: number[];
  let mockSelectedBooks: number[];

  configureTestingModule(() => ({
    imports: [MatChipsModule, TestTranslocoModule],
    providers: [
      { provide: ActivatedRoute, useMock: mockedActivatedRoute },
      { provide: ProgressService, useMock: mockedProgressService }
    ]
  }));

  beforeEach(() => {
    mockBooks = [1, 2, 3, 40, 42, 67, 70];
    mockSelectedBooks = [1, 3];
    when(mockedActivatedRoute.params).thenReturn(of({ projectId: 'project01' }));
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

    fixture = TestBed.createComponent(BookMultiSelectComponent);
    component = fixture.componentInstance;
    component.availableBooks = mockBooks;
    component.selectedBooks = mockSelectedBooks;
    fixture.detectChanges();
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
    component.selectedBooks = [1];
    await component.ngOnChanges();
    fixture.detectChanges();

    expect(component.partialOT).toBe(true);
    expect(component.partialNT).toBe(false);
    expect(component.partialDC).toBe(false);

    await component.select('OT', false);
    component.selectedBooks = [40];
    await component.ngOnChanges();
    fixture.detectChanges();

    expect(component.partialOT).toBe(false);
    expect(component.partialNT).toBe(true);
    expect(component.partialDC).toBe(false);

    await component.select('NT', false);
    component.selectedBooks = [67];
    await component.ngOnChanges();
    fixture.detectChanges();

    expect(component.partialOT).toBe(false);
    expect(component.partialOT).toBe(false);
    expect(component.partialDC).toBe(true);
  });
});
