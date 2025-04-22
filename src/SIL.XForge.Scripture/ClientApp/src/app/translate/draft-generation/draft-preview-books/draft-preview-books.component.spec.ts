import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { MatMenuHarness } from '@angular/material/menu/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { TextInfoPermission } from 'realtime-server/lib/esm/scriptureforge/models/text-info-permission';
import { BehaviorSubject, filter, of, Subscription } from 'rxjs';
import { anything, capture, instance, mock, verify, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DialogService } from 'xforge-common/dialog.service';
import { ErrorReportingService } from 'xforge-common/error-reporting.service';
import { I18nService } from 'xforge-common/i18n.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { SFProjectService } from '../../../core/sf-project.service';
import { TextDocService } from '../../../core/text-doc.service';
import { BuildDto } from '../../../machine-api/build-dto';
import { DraftApplyDialogComponent } from '../draft-apply-dialog/draft-apply-dialog.component';
import { DraftApplyProgress } from '../draft-apply-progress-dialog/draft-apply-progress-dialog.component';
import { DraftHandlingService } from '../draft-handling.service';
import { BookWithDraft, DraftPreviewBooksComponent } from './draft-preview-books.component';

const mockedActivatedProjectService = mock(ActivatedProjectService);
const mockedProjectService = mock(SFProjectService);
const mockedI18nService = mock(I18nService);
const mockedUserService = mock(UserService);
const mockedDraftHandlingService = mock(DraftHandlingService);
const mockedDialogService = mock(DialogService);
const mockedTextService = mock(TextDocService);
const mockedErrorReportingService = mock(ErrorReportingService);
const mockedRouter = mock(Router);

describe('DraftPreviewBooks', () => {
  let env: TestEnvironment;

  configureTestingModule(() => ({
    imports: [TestTranslocoModule, NoopAnimationsModule],
    providers: [
      { provide: ActivatedProjectService, useMock: mockedActivatedProjectService },
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: I18nService, useMock: mockedI18nService },
      { provide: UserService, useMock: mockedUserService },
      { provide: DraftHandlingService, useMock: mockedDraftHandlingService },
      { provide: DialogService, useMock: mockedDialogService },
      { provide: TextDocService, useMock: mockedTextService },
      { provide: ErrorReportingService, useMock: mockedErrorReportingService },
      { provide: Router, useMock: mockedRouter }
    ]
  }));

  afterEach(() => {
    env.progressSubscription?.unsubscribe();
  });

  it('should show books for a build', fakeAsync(() => {
    env = new TestEnvironment({
      additionalInfo: { translationScriptureRanges: [{ projectId: 'project01', scriptureRange: 'LEV' }] }
    } as BuildDto);
    expect(env.draftBookCount()).toEqual(1);
  }));

  it('should show books for a project if no build', fakeAsync(() => {
    env = new TestEnvironment();
    expect(env.draftBookCount()).toEqual(3);
  }));

  it('can navigate to a specific book', fakeAsync(() => {
    env = new TestEnvironment();
    env.getBookButtonAtIndex(0).querySelector('button')!.click();
    tick();
    env.fixture.detectChanges();
    verify(mockedRouter.navigate(anything(), anything())).once();
    const [url, extras] = capture(mockedRouter.navigate).first();
    expect(url).toEqual(['/projects', 'project01', 'translate', 'GEN', '1']);
    expect(extras).toEqual({
      queryParams: { 'draft-active': true, 'draft-timestamp': undefined }
    });
  }));

  it('opens more menu with options', fakeAsync(async () => {
    env = new TestEnvironment();
    const moreButton: HTMLElement = env.getBookButtonAtIndex(0).querySelector('.book-more')!;
    moreButton.click();
    tick();
    env.fixture.detectChanges();
    const harness: MatMenuHarness = await env.moreMenuHarness();
    const items = await harness.getItems();
    expect(items.length).toEqual(2);
    harness.close();
    tick();
    env.fixture.detectChanges();
  }));

  it('does not apply draft if user cancels', fakeAsync(() => {
    env = new TestEnvironment();
    const bookWithDraft: BookWithDraft = env.booksWithDrafts[0];
    setupDialog();
    expect(env.getBookButtonAtIndex(0).querySelector('.book-more')).toBeTruthy();
    env.component.chooseProjectToAddDraft(bookWithDraft);
    tick();
    env.fixture.detectChanges();
    verify(mockedDialogService.openMatDialog(DraftApplyDialogComponent, anything())).once();
    verify(mockedDraftHandlingService.getAndApplyDraftAsync(anything(), anything(), anything(), anything())).never();
  }));

  it('notifies user if applying a draft failed due to an error', fakeAsync(() => {
    env = new TestEnvironment();
    const bookWithDraft: BookWithDraft = env.booksWithDrafts[0];
    setupDialog('project01');
    when(mockedDraftHandlingService.getAndApplyDraftAsync(anything(), anything(), anything(), anything()))
      .thenReject(new Error('Draft error'))
      .thenResolve(true)
      .thenResolve(false);
    expect(env.getBookButtonAtIndex(0).querySelector('.book-more')).toBeTruthy();
    env.component.chooseProjectToAddDraft(bookWithDraft);
    tick();
    env.fixture.detectChanges();
    expect(env.draftApplyProgress!.chaptersApplied).toEqual([2]);
    expect(env.draftApplyProgress!.completed).toBe(true);
    verify(mockedDialogService.openMatDialog(DraftApplyDialogComponent, anything())).once();
    verify(mockedDraftHandlingService.getAndApplyDraftAsync(anything(), anything(), anything(), anything())).times(3);
    verify(mockedErrorReportingService.silentError(anything(), anything())).once();
  }));

  it('can apply all chapters of a draft to a book', fakeAsync(() => {
    env = new TestEnvironment();
    const bookWithDraft: BookWithDraft = env.booksWithDrafts[0];
    setupDialog('project01');
    when(mockedDraftHandlingService.getAndApplyDraftAsync(anything(), anything(), anything(), anything())).thenResolve(
      true
    );
    expect(env.getBookButtonAtIndex(0).querySelector('.book-more')).toBeTruthy();
    env.component.chooseProjectToAddDraft(bookWithDraft);
    tick();
    env.fixture.detectChanges();
    expect(env.draftApplyProgress!.chaptersApplied).toEqual([1, 2, 3]);
    expect(env.draftApplyProgress!.completed).toBe(true);
    verify(mockedDialogService.openMatDialog(DraftApplyDialogComponent, anything())).once();
    verify(mockedDraftHandlingService.getAndApplyDraftAsync(anything(), anything(), anything(), anything())).times(3);
  }));

  it('can apply chapters with drafts and skips chapters without drafts', fakeAsync(() => {
    env = new TestEnvironment();
    const bookWithDraft: BookWithDraft = env.booksWithDrafts[1];
    setupDialog('project01');
    when(mockedDraftHandlingService.getAndApplyDraftAsync(anything(), anything(), anything(), anything())).thenResolve(
      true
    );
    expect(env.getBookButtonAtIndex(1).querySelector('.book-more')).toBeTruthy();
    env.component.chooseProjectToAddDraft(bookWithDraft);
    tick();
    env.fixture.detectChanges();
    verify(mockedDialogService.openMatDialog(DraftApplyDialogComponent, anything())).once();
    verify(mockedDraftHandlingService.getAndApplyDraftAsync(anything(), anything(), anything(), anything())).times(1);
  }));

  it('can open dialog with the current project', fakeAsync(() => {
    env = new TestEnvironment();
    expect(env.getBookButtonAtIndex(0).querySelector('.book-more')).toBeTruthy();
    const mockedDialogRef: MatDialogRef<DraftApplyDialogComponent> = mock(MatDialogRef<DraftApplyDialogComponent>);
    when(mockedDialogRef.afterClosed()).thenReturn(of({ projectId: 'project01' }));
    when(mockedDialogService.openMatDialog(DraftApplyDialogComponent, anything())).thenReturn(
      instance(mockedDialogRef)
    );
    expect(env.component['projectParatextId']).toEqual(env.paratextId);
    env.component.chooseProjectToAddDraft(env.booksWithDrafts[0], env.paratextId);
    tick();
    env.fixture.detectChanges();
    verify(mockedDialogService.openMatDialog(DraftApplyDialogComponent, anything())).once();
    verify(mockedDraftHandlingService.getAndApplyDraftAsync(anything(), anything(), anything(), anything())).times(
      env.booksWithDrafts[0].chaptersWithDrafts.length
    );
    verify(mockedProjectService.onlineAddChapters('project01', anything(), anything())).never();
  }));

  it('can open dialog to apply draft to a different project', fakeAsync(() => {
    env = new TestEnvironment();
    expect(env.getBookButtonAtIndex(0).querySelector('.book-more')).toBeTruthy();
    const mockedDialogRef: MatDialogRef<DraftApplyDialogComponent> = mock(MatDialogRef<DraftApplyDialogComponent>);
    when(mockedDialogRef.afterClosed()).thenReturn(of({ projectId: 'otherProject' }));
    when(mockedDialogService.openMatDialog(DraftApplyDialogComponent, anything())).thenReturn(
      instance(mockedDialogRef)
    );
    env.component.chooseProjectToAddDraft(env.booksWithDrafts[0]);
    tick();
    env.fixture.detectChanges();
    verify(mockedDialogService.openMatDialog(DraftApplyDialogComponent, anything())).once();
    verify(mockedDraftHandlingService.getAndApplyDraftAsync(anything(), anything(), anything(), anything())).times(
      env.booksWithDrafts[0].chaptersWithDrafts.length
    );
    verify(mockedProjectService.onlineAddChapters('otherProject', anything(), anything())).never();
  }));

  it('translators can add draft to different project', fakeAsync(async () => {
    env = new TestEnvironment();
    when(mockedUserService.currentUserId).thenReturn('user02');
    const moreButton: HTMLElement = env.getBookButtonAtIndex(0).querySelector('.book-more')!;
    moreButton.click();
    tick();
    env.fixture.detectChanges();
    const harness: MatMenuHarness = await env.moreMenuHarness();
    const items = await harness.getItems();
    expect(items.length).toEqual(2);
    harness.close();
    tick();
    env.fixture.detectChanges();
  }));

  it('does not apply draft if user cancels applying to a different project', fakeAsync(() => {
    env = new TestEnvironment();
    setupDialog();
    env.component.chooseProjectToAddDraft(env.booksWithDrafts[0]);
    tick();
    env.fixture.detectChanges();
    verify(mockedDialogService.openMatDialog(DraftApplyDialogComponent, anything())).once();
    verify(mockedDraftHandlingService.getAndApplyDraftAsync(anything(), anything(), anything(), anything())).never();
    expect().nothing();
  }));

  it('creates the chapters in the project if they do not exist', fakeAsync(() => {
    env = new TestEnvironment();
    expect(env.getBookButtonAtIndex(0).querySelector('.book-more')).toBeTruthy();
    const projectEmptyBook = 'projectEmptyBook';
    const mockedDialogRef: MatDialogRef<DraftApplyDialogComponent> = mock(MatDialogRef<DraftApplyDialogComponent>);
    when(mockedDialogRef.afterClosed()).thenReturn(of({ projectId: projectEmptyBook }));
    when(mockedDialogService.openMatDialog(DraftApplyDialogComponent, anything())).thenReturn(
      instance(mockedDialogRef)
    );

    when(mockedProjectService.onlineAddChapters(projectEmptyBook, anything(), anything())).thenResolve();
    const projectWithChaptersMissing = createTestProjectProfile({
      texts: [
        { bookNum: 1, chapters: [{ number: 1, lastVerse: 0 }], permissions: { user01: TextInfoPermission.Write } }
      ]
    });
    when(mockedProjectService.getProfile(projectEmptyBook)).thenResolve({
      id: projectEmptyBook,
      data: projectWithChaptersMissing
    } as SFProjectProfileDoc);
    env.component.chooseProjectToAddDraft(env.booksWithDrafts[0], 'project01');
    tick();
    env.fixture.detectChanges();
    verify(mockedDialogService.openMatDialog(DraftApplyDialogComponent, anything())).once();
    verify(mockedProjectService.onlineAddChapters(projectEmptyBook, anything(), anything())).once();
    // needs to create 2 texts
    verify(mockedTextService.createTextDoc(anything())).twice();
    verify(mockedDraftHandlingService.getAndApplyDraftAsync(anything(), anything(), anything(), anything())).times(
      env.booksWithDrafts[0].chaptersWithDrafts.length
    );
  }));

  it('shows message to generate a new draft if legacy USFM draft', fakeAsync(() => {
    env = new TestEnvironment();
    const bookWithDraft: BookWithDraft = env.booksWithDrafts[0];
    setupDialog('project01');
    when(mockedDraftHandlingService.getAndApplyDraftAsync(anything(), anything(), anything(), anything())).thenResolve(
      false
    );
    expect(env.getBookButtonAtIndex(0).querySelector('.book-more')).toBeTruthy();
    env.component.chooseProjectToAddDraft(bookWithDraft);
    tick();
    env.fixture.detectChanges();
    verify(mockedDialogService.openMatDialog(DraftApplyDialogComponent, anything())).once();
    verify(mockedDraftHandlingService.getAndApplyDraftAsync(anything(), anything(), anything(), anything())).times(3);
  }));

  it('can track progress of chapters applied', fakeAsync(() => {
    env = new TestEnvironment();
    const bookWithDraft: BookWithDraft = env.booksWithDrafts[0];
    setupDialog('project01');
    const resolveSubject$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
    const promise: Promise<boolean> = new Promise<boolean>(resolve => {
      resolveSubject$.pipe(filter(value => value)).subscribe(() => resolve(true));
    });
    when(mockedDraftHandlingService.getAndApplyDraftAsync(anything(), anything(), anything(), anything()))
      .thenReturn(Promise.resolve(true))
      .thenReturn(promise);
    expect(env.getBookButtonAtIndex(0).querySelector('.book-more')).toBeTruthy();
    env.component.chooseProjectToAddDraft(bookWithDraft);
    tick();
    env.fixture.detectChanges();
    verify(mockedDialogService.openMatDialog(DraftApplyDialogComponent, anything())).once();
    verify(mockedDraftHandlingService.getAndApplyDraftAsync(anything(), anything(), anything(), anything())).times(3);
    expect(env.component.numChaptersApplied).toEqual(1);
    resolveSubject$.next(true);
    resolveSubject$.complete();
    tick();
    env.fixture.detectChanges();
    expect(env.component.numChaptersApplied).toEqual(3);
  }));

  function setupDialog(projectId?: string): void {
    const mockedDialogRef: MatDialogRef<DraftApplyDialogComponent> = mock(MatDialogRef<DraftApplyDialogComponent>);
    when(mockedDialogRef.afterClosed()).thenReturn(of(projectId ? { projectId } : undefined));
    when(mockedDialogService.openMatDialog(DraftApplyDialogComponent, anything())).thenReturn(
      instance(mockedDialogRef)
    );
  }
});

class TestEnvironment {
  component: DraftPreviewBooksComponent;
  fixture: ComponentFixture<DraftPreviewBooksComponent>;
  draftApplyProgress?: DraftApplyProgress;
  progressSubscription?: Subscription;
  loader: HarnessLoader;
  readonly paratextId = 'pt01';
  mockProjectDoc: SFProjectProfileDoc = {
    data: createTestProjectProfile({
      paratextId: this.paratextId,
      texts: [
        {
          bookNum: 1,
          hasSource: true,
          chapters: [
            { number: 1, hasDraft: true },
            { number: 2, hasDraft: true },
            { number: 3, hasDraft: true }
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
      userRoles: { user01: SFProjectRole.ParatextAdministrator, user02: SFProjectRole.ParatextTranslator },
      translateConfig: {
        source: { projectRef: 'test' }
      }
    })
  } as SFProjectProfileDoc;

  booksWithDrafts: BookWithDraft[] = [
    { bookNumber: 1, canEdit: true, chaptersWithDrafts: [1, 2, 3], draftApplied: false },
    { bookNumber: 2, canEdit: true, chaptersWithDrafts: [1], draftApplied: false },
    { bookNumber: 3, canEdit: false, chaptersWithDrafts: [1, 2], draftApplied: false }
  ];

  constructor(build: BuildDto | undefined = undefined) {
    when(mockedActivatedProjectService.changes$).thenReturn(of(this.mockProjectDoc));
    when(mockedActivatedProjectService.projectDoc).thenReturn(this.mockProjectDoc);
    when(mockedI18nService.localizeBook(1)).thenReturn('Genesis');
    when(
      mockedDraftHandlingService.getAndApplyDraftAsync(anything(), anything(), anything(), anything())
    ).thenResolve();
    when(mockedActivatedProjectService.projectId).thenReturn('project01');
    when(mockedUserService.currentUserId).thenReturn('user01');
    when(mockedProjectService.getProfile(anything())).thenResolve(this.mockProjectDoc);
    this.fixture = TestBed.createComponent(DraftPreviewBooksComponent);
    this.component = this.fixture.componentInstance;
    this.component.build = build;
    this.loader = TestbedHarnessEnvironment.loader(this.fixture);
    this.component.draftApplyProgress$.subscribe(progress => (this.draftApplyProgress = progress));
    tick();
    this.fixture.detectChanges();
  }

  draftBookCount(): number {
    return this.fixture.nativeElement.querySelectorAll('.draft-book-option').length;
  }

  getBookButtonAtIndex(index: number): HTMLElement {
    return this.fixture.nativeElement.querySelectorAll('.draft-book-option')[index];
  }

  async moreMenuHarness(): Promise<MatMenuHarness> {
    return await this.loader.getHarness(MatMenuHarness.with({ selector: '.book-more' }));
  }
}
