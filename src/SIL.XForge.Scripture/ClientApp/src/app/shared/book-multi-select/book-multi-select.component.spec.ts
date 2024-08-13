import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatChipsModule } from '@angular/material/chips';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { mock, when } from 'ts-mockito';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { ProgressService, TextProgress } from '../progress-service/progress-service';
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
    mockBooks = [1, 2, 3, 42, 70];
    mockSelectedBooks = [1, 3];
    when(mockedActivatedRoute.params).thenReturn(of({ projectId: 'project01' }));
    when(mockedProgressService.isLoaded$).thenReturn(of(true));
    fixture = TestBed.createComponent(BookMultiSelectComponent);
    component = fixture.componentInstance;
    component.availableBooks = mockBooks;
    component.selectedBooks = mockSelectedBooks;
    fixture.detectChanges();
  });

  it('should initialize book options on ngOnChanges', async () => {
    when(mockedProgressService.texts).thenReturn([
      { text: { bookNum: 1 }, percentage: 0 } as TextProgress,
      { text: { bookNum: 2 }, percentage: 20 } as TextProgress,
      { text: { bookNum: 3 }, percentage: 40 } as TextProgress,
      { text: { bookNum: 42 }, percentage: 70 } as TextProgress,
      { text: { bookNum: 70 }, percentage: 100 } as TextProgress
    ]);

    await component.ngOnChanges();

    expect(component.bookOptions).toEqual([
      { bookNum: 1, bookId: 'GEN', selected: true, progressPercentage: 0 },
      { bookNum: 2, bookId: 'EXO', selected: false, progressPercentage: 20 },
      { bookNum: 3, bookId: 'LEV', selected: true, progressPercentage: 40 },
      { bookNum: 42, bookId: 'LUK', selected: false, progressPercentage: 70 },
      { bookNum: 70, bookId: 'WIS', selected: false, progressPercentage: 100 }
    ]);
  });

  it('can select all OT books', async () => {
    expect(component.selectedBooks.length).toEqual(2);

    await component.select('OT');

    expect(component.selectedBooks.length).toEqual(3);
  });

  it('can select all NT books', async () => {
    expect(component.selectedBooks.length).toEqual(2);

    await component.select('NT');

    expect(component.selectedBooks.length).toEqual(3);
  });

  it('can select all DC books', async () => {
    expect(component.selectedBooks.length).toEqual(2);

    await component.select('DC');

    expect(component.selectedBooks.length).toEqual(3);
  });

  it('can reset book selection', async () => {
    expect(component.selectedBooks.length).toEqual(2);

    await component.clear();

    expect(component.selectedBooks.length).toEqual(0);
  });
});
