import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { provideTestOnlineStatus } from 'xforge-common/test-online-status-providers';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { anything, mock, verify, when } from 'ts-mockito';
import { I18nService } from 'xforge-common/i18n.service';
import { configureTestingModule, getTestTranslocoModule } from 'xforge-common/test-utils';
import {
  BookProgressWithChapterProgress,
  ProgressService,
  ProjectProgressWithChapterProgress
} from '../progress-service/progress.service';
import { Book } from './book-multi-select';
import { BookMultiSelectComponent } from './book-multi-select.component';

const mockedProgressService = mock(ProgressService);
const mockedI18nService = mock(I18nService);

/** Progress for a book whose only chapter is present, so its ratio is simply the translated fraction of its verses. */
function completeBook(bookId: string, verses: number, blankVerses: number): BookProgressWithChapterProgress {
  return {
    bookId,
    verses,
    blankVerses,
    expectedVerses: verses,
    chapters: [{ chapterNumber: 1, verses, blankVerses, expectedVerses: verses }]
  };
}

describe('BookMultiSelectComponent', () => {
  let component: BookMultiSelectComponent;
  let fixture: ComponentFixture<BookMultiSelectComponent>;
  let onlineStatus: TestOnlineStatusService;

  let mockBooks: Book[];
  let mockSelectedBooks: Book[];

  configureTestingModule(() => ({
    imports: [getTestTranslocoModule()],
    providers: [
      provideTestOnlineStatus(),
      { provide: OnlineStatusService, useClass: TestOnlineStatusService },
      { provide: ProgressService, useMock: mockedProgressService },
      { provide: I18nService, useMock: mockedI18nService }
    ]
  }));

  function book(bookNum: number): Book {
    return { number: bookNum, selected: false };
  }

  // Progress is fetched asynchronously; wait for the pipeline to settle and re-run change detection.
  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    mockBooks = [book(1), book(2), book(3), book(40), book(42), book(67), book(70)];
    mockSelectedBooks = [
      { number: 1, selected: true },
      { number: 3, selected: true }
    ];
    when(mockedProgressService.getProgressWithChapterProgress(anything(), anything())).thenResolve(
      new ProjectProgressWithChapterProgress([
        completeBook('GEN', 0, 0),
        completeBook('EXO', 10_000, 8_500),
        completeBook('LEV', 10_000, 7_000),
        completeBook('MAT', 10_000, 5_500),
        completeBook('LUK', 10_000, 4_000),
        completeBook('TOB', 10_000, 2_000),
        completeBook('WIS', 10_000, 0)
      ])
    );
    when(mockedI18nService.localeCode).thenReturn('en');

    fixture = TestBed.createComponent(BookMultiSelectComponent);
    component = fixture.componentInstance;
    onlineStatus = TestBed.inject(OnlineStatusService) as TestOnlineStatusService;
    component.availableBooks = mockBooks;
    component.selectedBooks = mockSelectedBooks;
    component.projectId = 'test-project-id';
    // Mirror the "full" usage: fetch/show progress and offer the testament select-all checkboxes.
    component.showProgress = true;
    component.bulkBookSelection = true;
    // Inputs are set imperatively on the root fixture, so Angular won't call ngOnChanges for us; push them ourselves.
    component.ngOnChanges();
    await settle();
  });

  it('supports providing project name', async () => {
    expect(fixture.nativeElement.querySelector('.project-name')).toBeNull();
    component.projectName = 'Test Project';
    await settle();
    expect(fixture.nativeElement.querySelector('.project-name')).not.toBeNull();
  });

  it('should initialize book options', () => {
    expect(component.bookOptions).toEqual([
      { bookNum: 1, bookId: 'GEN', selected: true, progress: 0.0 },
      { bookNum: 2, bookId: 'EXO', selected: false, progress: 0.15 },
      { bookNum: 3, bookId: 'LEV', selected: true, progress: 0.3 },
      { bookNum: 40, bookId: 'MAT', selected: false, progress: 0.45 },
      { bookNum: 42, bookId: 'LUK', selected: false, progress: 0.6 },
      { bookNum: 67, bookId: 'TOB', selected: false, progress: 0.8 },
      { bookNum: 70, bookId: 'WIS', selected: false, progress: 1 }
    ]);
  });

  it('fetches progress only once for a project, no matter how many times the inputs change reference', async () => {
    for (let i = 0; i < 5; i++) {
      component.availableBooks = [...mockBooks];
      component.selectedBooks = [...mockSelectedBooks];
      component.ngOnChanges();
      await settle();
    }

    verify(mockedProgressService.getProgressWithChapterProgress('test-project-id', anything())).once();
    expect(component.bookOptions.length).toBe(mockBooks.length);
  });

  it('re-fetches progress when the project changes', async () => {
    component.projectId = 'a-different-project-id';
    component.ngOnChanges();
    await settle();

    verify(mockedProgressService.getProgressWithChapterProgress('a-different-project-id', anything())).once();
    expect().nothing();
  });

  it('does not fetch progress when showProgress is false', async () => {
    fixture = TestBed.createComponent(BookMultiSelectComponent);
    component = fixture.componentInstance;
    component.availableBooks = mockBooks;
    component.selectedBooks = mockSelectedBooks;
    component.projectId = 'no-progress-project';
    component.showProgress = false;
    component.ngOnChanges();
    await settle();

    verify(mockedProgressService.getProgressWithChapterProgress('no-progress-project', anything())).never();
    expect(component.bookOptions.length).toBe(mockBooks.length);
    expect(component.bookOptions.every(b => b.progress == null)).toBe(true);
  });

  it('does not crash or fetch when offline, and still renders the books', async () => {
    onlineStatus.setIsOnline(false);
    component.projectId = 'offline-project';
    component.ngOnChanges();
    await settle();

    verify(mockedProgressService.getProgressWithChapterProgress('offline-project', anything())).never();
    expect(component.bookOptions.length).toBe(mockBooks.length);
  });

  it('fetches progress once the connection returns', async () => {
    onlineStatus.setIsOnline(false);
    component.projectId = 'reconnect-project';
    component.ngOnChanges();
    await settle();
    verify(mockedProgressService.getProgressWithChapterProgress('reconnect-project', anything())).never();

    onlineStatus.setIsOnline(true);
    await settle();
    verify(mockedProgressService.getProgressWithChapterProgress('reconnect-project', anything())).once();
    expect().nothing();
  });

  it('does not re-fetch progress when the connection drops and returns after it has loaded', async () => {
    // beforeEach already fetched progress for 'test-project-id' while online.
    verify(mockedProgressService.getProgressWithChapterProgress('test-project-id', anything())).once();

    onlineStatus.setIsOnline(false);
    await settle();
    onlineStatus.setIsOnline(true);
    await settle();

    // Online status is only a gate for the initial fetch; toggling it must not trigger another fetch.
    verify(mockedProgressService.getProgressWithChapterProgress('test-project-id', anything())).once();
    expect().nothing();
  });

  it('should not crash when texts have not yet loaded', async () => {
    when(mockedProgressService.getProgressWithChapterProgress(anything(), anything())).thenResolve(
      new ProjectProgressWithChapterProgress([])
    );
    component.projectId = 'empty-progress-project';
    component.ngOnChanges();
    await settle();

    expect(component.bookOptions).toEqual([
      { bookNum: 1, bookId: 'GEN', selected: true, progress: null },
      { bookNum: 2, bookId: 'EXO', selected: false, progress: null },
      { bookNum: 3, bookId: 'LEV', selected: true, progress: null },
      { bookNum: 40, bookId: 'MAT', selected: false, progress: null },
      { bookNum: 42, bookId: 'LUK', selected: false, progress: null },
      { bookNum: 67, bookId: 'TOB', selected: false, progress: null },
      { bookNum: 70, bookId: 'WIS', selected: false, progress: null }
    ]);
  });

  it('can select all OT books and clear all OT books', () => {
    expect(component.selectedBooks.length).toEqual(2);

    component.select('OT', true);
    expect(component.selectedBooks.length).toEqual(3);

    component.select('OT', false);
    expect(component.selectedBooks.length).toEqual(0);
  });

  it('can select all NT books and clear all NT books', () => {
    expect(component.selectedBooks.length).toEqual(2);

    component.select('NT', true);
    expect(component.selectedBooks.length).toEqual(4);

    component.select('NT', false);
    expect(component.selectedBooks.length).toEqual(2);
  });

  it('can select all DC books and clear all DC books', () => {
    expect(component.selectedBooks.length).toEqual(2);

    component.select('DC', true);
    expect(component.selectedBooks.length).toEqual(4);

    component.select('DC', false);
    expect(component.selectedBooks.length).toEqual(2);
  });

  it('should show checkboxes for OT, NT, and DC as indeterminate when only some books from that category are selected', async () => {
    component.select('OT', false);
    component.selectedBooks = [{ number: 1, selected: true }];
    component.ngOnChanges();
    await settle();

    expect(component.partialOT).toBe(true);
    expect(component.partialNT).toBe(false);
    expect(component.partialDC).toBe(false);

    component.select('OT', false);
    component.selectedBooks = [{ number: 40, selected: true }];
    component.ngOnChanges();
    await settle();

    expect(component.partialOT).toBe(false);
    expect(component.partialNT).toBe(true);
    expect(component.partialDC).toBe(false);

    component.select('NT', false);
    component.selectedBooks = [{ number: 67, selected: true }];
    component.ngOnChanges();
    await settle();

    expect(component.partialOT).toBe(false);
    expect(component.partialOT).toBe(false);
    expect(component.partialDC).toBe(true);
  });

  it('hides the progress bars when showProgress is false', async () => {
    expect(fixture.nativeElement.querySelector('.book-multi-select .border-fill')).not.toBeNull();
    component.showProgress = false;
    await settle();
    expect(fixture.nativeElement.querySelector('.book-multi-select .border-fill')).toBeNull();
  });

  it('hides the testament checkboxes when bulkBookSelection is false', async () => {
    expect(fixture.nativeElement.querySelector('.scope-selection')).not.toBeNull();
    component.bulkBookSelection = false;
    await settle();
    expect(fixture.nativeElement.querySelector('.scope-selection')).toBeNull();
  });
});
