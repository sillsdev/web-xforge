import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { RouterModule } from '@angular/router';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { of } from 'rxjs';
import { anything, instance, mock, verify, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DialogService } from 'xforge-common/dialog.service';
import { ErrorReportingService } from 'xforge-common/error-reporting.service';
import { I18nService } from 'xforge-common/i18n.service';
import { NoticeService } from 'xforge-common/notice.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { DraftHandlingService } from '../draft-handling.service';
import { BookWithDraft, DraftPreviewBooksComponent } from './draft-preview-books.component';

const mockedActivatedProjectService = mock(ActivatedProjectService);
const mockedI18nService = mock(I18nService);
const mockedDraftHandlingService = mock(DraftHandlingService);
const mockedNoticeService = mock(NoticeService);
const mockedDialogService = mock(DialogService);
const mockedErrorReportingService = mock(ErrorReportingService);

describe('DraftPreviewBooks', () => {
  configureTestingModule(() => ({
    imports: [
      UICommonModule,
      DraftPreviewBooksComponent,
      RouterModule.forRoot([]),
      TestTranslocoModule,
      NoopAnimationsModule
    ],
    providers: [
      { provide: ActivatedProjectService, useMock: mockedActivatedProjectService },
      { provide: I18nService, useMock: mockedI18nService },
      { provide: DraftHandlingService, useMock: mockedDraftHandlingService },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: DialogService, useMock: mockedDialogService },
      { provide: ErrorReportingService, useMock: mockedErrorReportingService }
    ]
  }));

  it('should show books', fakeAsync(() => {
    const env = new TestEnvironment();
    expect(env.draftBookCount()).toEqual(2);
  }));

  it('can apply book to project', fakeAsync(() => {
    const env = new TestEnvironment();
    expect(env.getBookButtonAtIndex(0).textContent).toContain('Genesis');
  }));

  it('does not apply draft if user cancels', fakeAsync(() => {
    const env = new TestEnvironment();
    const bookWithDraft: BookWithDraft = env.booksWithDrafts[0];
    const mockedMatDialogRef = mock(MatDialogRef);
    when(mockedMatDialogRef.afterClosed()).thenReturn(of(false));
    when(mockedDialogService.openMatDialog(anything(), anything())).thenReturn(instance(mockedMatDialogRef));
    env.component.applyBookDraftAsync(bookWithDraft);
    tick();
    env.fixture.detectChanges();
    verify(mockedDialogService.openMatDialog(anything(), anything())).once();
    verify(mockedDraftHandlingService.getAndApplyDraftAsync(anything())).never();
    verify(mockedNoticeService.show(anything())).never();
    expect().nothing();
  }));

  it('notifies user if applying a draft failed due to an error', fakeAsync(() => {
    const env = new TestEnvironment();
    const bookWithDraft: BookWithDraft = env.booksWithDrafts[0];
    const mockedMatDialogRef = mock(MatDialogRef);
    when(mockedMatDialogRef.afterClosed()).thenReturn(of(true));
    when(mockedDialogService.openMatDialog(anything(), anything())).thenReturn(instance(mockedMatDialogRef));
    when(mockedDraftHandlingService.getAndApplyDraftAsync(anything())).thenReject(new Error('Draft error'));
    env.component.applyBookDraftAsync(bookWithDraft);
    tick();
    env.fixture.detectChanges();
    verify(mockedDialogService.openMatDialog(anything(), anything())).once();
    verify(mockedDraftHandlingService.getAndApplyDraftAsync(anything())).times(2);
    verify(mockedNoticeService.show(anything())).never();
    verify(mockedDialogService.message(anything())).once();
    verify(mockedErrorReportingService.silentError(anything(), anything())).once();
    expect().nothing();
  }));

  it('can apply all chapters of a draft to a book', fakeAsync(() => {
    const env = new TestEnvironment();
    const bookWithDraft: BookWithDraft = env.booksWithDrafts[0];
    const mockedMatDialogRef = mock(MatDialogRef);
    when(mockedMatDialogRef.afterClosed()).thenReturn(of(true));
    when(mockedDialogService.openMatDialog(anything(), anything())).thenReturn(instance(mockedMatDialogRef));
    when(mockedDraftHandlingService.getAndApplyDraftAsync(anything())).thenResolve(true);
    env.component.applyBookDraftAsync(bookWithDraft);
    tick();
    env.fixture.detectChanges();
    verify(mockedDialogService.openMatDialog(anything(), anything())).once();
    verify(mockedDraftHandlingService.getAndApplyDraftAsync(anything())).times(2);
    verify(mockedNoticeService.show(anything())).once();
    expect().nothing();
  }));

  it('can apply chapters with drafts and skips chapters without drafts', fakeAsync(() => {
    const env = new TestEnvironment();
    const bookWithDraft: BookWithDraft = env.booksWithDrafts[1];
    const mockedMatDialogRef = mock(MatDialogRef);
    when(mockedMatDialogRef.afterClosed()).thenReturn(of(true));
    when(mockedDialogService.openMatDialog(anything(), anything())).thenReturn(instance(mockedMatDialogRef));
    when(mockedDraftHandlingService.getAndApplyDraftAsync(anything())).thenResolve(true);
    env.component.applyBookDraftAsync(bookWithDraft);
    tick();
    env.fixture.detectChanges();
    verify(mockedDialogService.openMatDialog(anything(), anything())).once();
    verify(mockedDraftHandlingService.getAndApplyDraftAsync(anything())).times(1);
    verify(mockedNoticeService.show(anything())).once();
    expect().nothing();
  }));

  it('shows message to generate a new draft if legacy USFM draft', fakeAsync(() => {
    const env = new TestEnvironment();
    const bookWithDraft: BookWithDraft = env.booksWithDrafts[0];
    const mockedMatDialogRef = mock(MatDialogRef);
    when(mockedMatDialogRef.afterClosed()).thenReturn(of(true));
    when(mockedDialogService.openMatDialog(anything(), anything())).thenReturn(instance(mockedMatDialogRef));
    when(mockedDraftHandlingService.getAndApplyDraftAsync(anything())).thenResolve(false);
    env.component.applyBookDraftAsync(bookWithDraft);
    tick();
    env.fixture.detectChanges();
    verify(mockedDialogService.openMatDialog(anything(), anything())).once();
    verify(mockedDraftHandlingService.getAndApplyDraftAsync(anything())).times(2);
    verify(mockedNoticeService.show(anything())).never();
    verify(mockedDialogService.message(anything())).once();
    expect().nothing();
  }));
});

class TestEnvironment {
  component: DraftPreviewBooksComponent;
  fixture: ComponentFixture<DraftPreviewBooksComponent>;
  mockProjectDoc: SFProjectProfileDoc = {
    data: createTestProjectProfile({
      texts: [
        {
          bookNum: 1,
          hasSource: true,
          chapters: [
            { number: 1, hasDraft: true },
            { number: 2, hasDraft: true }
          ]
        },
        {
          bookNum: 2,
          hasSource: true,
          chapters: [
            { number: 1, hasDraft: true },
            { number: 2, hasDraft: false }
          ]
        }
      ],
      translateConfig: {
        source: { projectRef: 'test' }
      }
    })
  } as SFProjectProfileDoc;

  booksWithDrafts: BookWithDraft[] = [
    { bookNumber: 1, chaptersWithDrafts: [1, 2] },
    { bookNumber: 2, chaptersWithDrafts: [1] }
  ];

  constructor() {
    when(mockedActivatedProjectService.changes$).thenReturn(of(this.mockProjectDoc));
    when(mockedI18nService.localizeBook(1)).thenReturn('Genesis');
    when(mockedDraftHandlingService.getAndApplyDraftAsync(anything())).thenResolve();
    this.fixture = TestBed.createComponent(DraftPreviewBooksComponent);
    this.component = this.fixture.componentInstance;
    tick();
    this.fixture.detectChanges();
  }

  draftBookCount(): number {
    return this.fixture.nativeElement.querySelectorAll('.draft-book-option').length;
  }

  getBookButtonAtIndex(index: number): HTMLElement {
    return this.fixture.nativeElement.querySelectorAll('.draft-book-option')[index];
  }
}
