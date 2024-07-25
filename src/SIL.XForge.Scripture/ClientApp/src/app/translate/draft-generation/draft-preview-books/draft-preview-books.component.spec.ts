import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { TextInfoPermission } from 'realtime-server/lib/esm/scriptureforge/models/text-info-permission';
import { of } from 'rxjs';
import { anything, capture, mock, verify, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DialogService } from 'xforge-common/dialog.service';
import { ErrorReportingService } from 'xforge-common/error-reporting.service';
import { I18nService } from 'xforge-common/i18n.service';
import { NoticeService } from 'xforge-common/notice.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { DraftHandlingService } from '../draft-handling.service';
import { BookWithDraft, DraftPreviewBooksComponent } from './draft-preview-books.component';

const mockedActivatedProjectService = mock(ActivatedProjectService);
const mockedI18nService = mock(I18nService);
const mockedUserService = mock(UserService);
const mockedDraftHandlingService = mock(DraftHandlingService);
const mockedNoticeService = mock(NoticeService);
const mockedDialogService = mock(DialogService);
const mockedErrorReportingService = mock(ErrorReportingService);
const mockedRouter = mock(Router);

describe('DraftPreviewBooks', () => {
  configureTestingModule(() => ({
    imports: [UICommonModule, DraftPreviewBooksComponent, TestTranslocoModule, NoopAnimationsModule],
    providers: [
      { provide: ActivatedProjectService, useMock: mockedActivatedProjectService },
      { provide: I18nService, useMock: mockedI18nService },
      { provide: UserService, useMock: mockedUserService },
      { provide: DraftHandlingService, useMock: mockedDraftHandlingService },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: DialogService, useMock: mockedDialogService },
      { provide: ErrorReportingService, useMock: mockedErrorReportingService },
      { provide: Router, useMock: mockedRouter }
    ]
  }));

  it('should show books', fakeAsync(() => {
    const env = new TestEnvironment();
    expect(env.draftBookCount()).toEqual(3);
  }));

  it('can navigate to a specific book', fakeAsync(() => {
    const env = new TestEnvironment();
    env.getBookButtonAtIndex(0).querySelector('button')!.click();
    tick();
    env.fixture.detectChanges();
    verify(mockedRouter.navigate(anything(), anything())).once();
    const [url, extras] = capture(mockedRouter.navigate).first();
    expect(url).toEqual(['/projects', 'project01', 'translate', 'GEN', '1']);
    expect(extras).toEqual({
      queryParams: { 'draft-active': true }
    });
  }));

  it('does not apply draft if user cancels', fakeAsync(() => {
    const env = new TestEnvironment();
    const bookWithDraft: BookWithDraft = env.booksWithDrafts[0];
    when(mockedDialogService.confirmWithOptions(anything())).thenResolve(false);
    expect(env.getBookButtonAtIndex(0).querySelector('.book-more')).toBeTruthy();
    env.component.applyBookDraftAsync(bookWithDraft);
    tick();
    env.fixture.detectChanges();
    verify(mockedDialogService.confirmWithOptions(anything())).once();
    verify(mockedDraftHandlingService.getAndApplyDraftAsync(anything(), anything())).never();
    verify(mockedNoticeService.show(anything())).never();
  }));

  it('notifies user if applying a draft failed due to an error', fakeAsync(() => {
    const env = new TestEnvironment();
    const bookWithDraft: BookWithDraft = env.booksWithDrafts[0];
    when(mockedDialogService.confirmWithOptions(anything())).thenResolve(true);
    when(mockedDraftHandlingService.getAndApplyDraftAsync(anything(), anything())).thenReject(new Error('Draft error'));
    expect(env.getBookButtonAtIndex(0).querySelector('.book-more')).toBeTruthy();
    env.component.applyBookDraftAsync(bookWithDraft);
    tick();
    env.fixture.detectChanges();
    verify(mockedDialogService.confirmWithOptions(anything())).once();
    verify(mockedDraftHandlingService.getAndApplyDraftAsync(anything(), anything())).times(2);
    verify(mockedNoticeService.show(anything())).never();
    verify(mockedDialogService.message(anything())).once();
    verify(mockedErrorReportingService.silentError(anything(), anything())).once();
  }));

  it('notifies user if they do not have permission to edit a book when applying a draft', fakeAsync(() => {
    const env = new TestEnvironment();
    const bookWithDraft: BookWithDraft = env.booksWithDrafts[2];
    when(mockedDialogService.message(anything())).thenResolve();
    expect(env.getBookButtonAtIndex(2).querySelector('.book-more')).toBeTruthy();
    env.component.applyBookDraftAsync(bookWithDraft);
    tick();
    env.fixture.detectChanges();
    verify(mockedDialogService.confirmWithOptions(anything())).never();
    verify(mockedDraftHandlingService.getAndApplyDraftAsync(anything(), anything())).never();
    verify(mockedNoticeService.show(anything())).never();
    verify(mockedDialogService.message(anything())).once();
    verify(mockedErrorReportingService.silentError(anything(), anything())).never();
  }));

  it('can apply all chapters of a draft to a book', fakeAsync(() => {
    const env = new TestEnvironment();
    const bookWithDraft: BookWithDraft = env.booksWithDrafts[0];
    when(mockedDialogService.confirmWithOptions(anything())).thenResolve(true);
    when(mockedDraftHandlingService.getAndApplyDraftAsync(anything(), anything())).thenResolve(true);
    expect(env.getBookButtonAtIndex(0).querySelector('.book-more')).toBeTruthy();
    env.component.applyBookDraftAsync(bookWithDraft);
    tick();
    env.fixture.detectChanges();
    verify(mockedDialogService.confirmWithOptions(anything())).once();
    verify(mockedDraftHandlingService.getAndApplyDraftAsync(anything(), anything())).times(2);
    verify(mockedNoticeService.show(anything())).once();
  }));

  it('can apply chapters with drafts and skips chapters without drafts', fakeAsync(() => {
    const env = new TestEnvironment();
    const bookWithDraft: BookWithDraft = env.booksWithDrafts[1];
    when(mockedDialogService.confirmWithOptions(anything())).thenResolve(true);
    when(mockedDraftHandlingService.getAndApplyDraftAsync(anything(), anything())).thenResolve(true);
    expect(env.getBookButtonAtIndex(1).querySelector('.book-more')).toBeTruthy();
    env.component.applyBookDraftAsync(bookWithDraft);
    tick();
    env.fixture.detectChanges();
    verify(mockedDialogService.confirmWithOptions(anything())).once();
    verify(mockedDraftHandlingService.getAndApplyDraftAsync(anything(), anything())).times(1);
    verify(mockedNoticeService.show(anything())).once();
  }));

  it('shows message to generate a new draft if legacy USFM draft', fakeAsync(() => {
    const env = new TestEnvironment();
    const bookWithDraft: BookWithDraft = env.booksWithDrafts[0];
    when(mockedDialogService.confirmWithOptions(anything())).thenResolve(true);
    when(mockedDraftHandlingService.getAndApplyDraftAsync(anything(), anything())).thenResolve(false);
    expect(env.getBookButtonAtIndex(0).querySelector('.book-more')).toBeTruthy();
    env.component.applyBookDraftAsync(bookWithDraft);
    tick();
    env.fixture.detectChanges();
    verify(mockedDialogService.confirmWithOptions(anything())).once();
    verify(mockedDraftHandlingService.getAndApplyDraftAsync(anything(), anything())).times(2);
    verify(mockedNoticeService.show(anything())).never();
    verify(mockedDialogService.message(anything())).once();
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
          ],
          permissions: { user01: TextInfoPermission.Write }
        },
        {
          bookNum: 2,
          hasSource: true,
          chapters: [
            { number: 1, hasDraft: true },
            { number: 2, hasDraft: false }
          ],
          permissions: { user01: TextInfoPermission.Write }
        },
        {
          bookNum: 3,
          hasSource: true,
          chapters: [
            { number: 1, hasDraft: true },
            { number: 2, hasDraft: true }
          ],
          permissions: { user01: TextInfoPermission.Read }
        }
      ],
      userRoles: { user01: SFProjectRole.ParatextAdministrator },
      translateConfig: {
        source: { projectRef: 'test' }
      }
    })
  } as SFProjectProfileDoc;

  booksWithDrafts: BookWithDraft[] = [
    { bookNumber: 1, canEdit: true, chaptersWithDrafts: [1, 2] },
    { bookNumber: 2, canEdit: true, chaptersWithDrafts: [1] },
    { bookNumber: 3, canEdit: false, chaptersWithDrafts: [1, 2] }
  ];

  constructor() {
    when(mockedActivatedProjectService.changes$).thenReturn(of(this.mockProjectDoc));
    when(mockedActivatedProjectService.projectDoc).thenReturn(this.mockProjectDoc);
    when(mockedI18nService.localizeBook(1)).thenReturn('Genesis');
    when(mockedDraftHandlingService.getAndApplyDraftAsync(anything(), anything())).thenResolve();
    when(mockedActivatedProjectService.projectId).thenReturn('project01');
    when(mockedUserService.currentUserId).thenReturn('user01');
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
