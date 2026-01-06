import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { TextInfoPermission } from 'realtime-server/lib/esm/scriptureforge/models/text-info-permission';
import { of, Subscription } from 'rxjs';
import { anything, capture, mock, verify, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { ErrorReportingService } from 'xforge-common/error-reporting.service';
import { configureTestingModule, getTestTranslocoModule } from 'xforge-common/test-utils';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { SFProjectService } from '../../../core/sf-project.service';
import { BuildDto } from '../../../machine-api/build-dto';
import { DraftApplyProgress } from '../draft-apply-progress-dialog/draft-apply-progress-dialog.component';
import { BookWithDraft, DraftPreviewBooksComponent } from './draft-preview-books.component';

const mockedActivatedProjectService = mock(ActivatedProjectService);
const mockedProjectService = mock(SFProjectService);
const mockedUserService = mock(UserService);
const mockedErrorReportingService = mock(ErrorReportingService);
const mockedRouter = mock(Router);

describe('DraftPreviewBooks', () => {
  let env: TestEnvironment;

  configureTestingModule(() => ({
    imports: [getTestTranslocoModule()],
    providers: [
      { provide: ActivatedProjectService, useMock: mockedActivatedProjectService },
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: UserService, useMock: mockedUserService },
      { provide: ErrorReportingService, useMock: mockedErrorReportingService },
      { provide: Router, useMock: mockedRouter },
      provideNoopAnimations()
    ]
  }));

  afterEach(() => {
    env?.progressSubscription?.unsubscribe();
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
    env.getBookButtonAtIndex(0).click();
    tick();
    env.fixture.detectChanges();
    verify(mockedRouter.navigate(anything(), anything())).once();
    const [url, extras] = capture(mockedRouter.navigate).first();
    expect(url).toEqual(['/projects', 'project01', 'translate', 'GEN', '1']);
    expect(extras).toEqual({
      queryParams: { 'draft-active': true, 'draft-timestamp': undefined }
    });
  }));
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
          chapters: [{ number: 1 }, { number: 2 }, { number: 3 }],
          permissions: { user01: TextInfoPermission.Write }
        },
        {
          bookNum: 2,
          hasSource: true,
          chapters: [{ number: 1 }, { number: 2 }],
          permissions: { user01: TextInfoPermission.Write }
        },
        {
          bookNum: 3,
          hasSource: true,
          chapters: [{ number: 1 }, { number: 2 }],
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
    { bookNumber: 1, bookId: 'GEN', canEdit: true, chaptersWithDrafts: [1, 2, 3], draftApplied: false },
    { bookNumber: 2, bookId: 'EXO', canEdit: true, chaptersWithDrafts: [1, 2], draftApplied: false },
    { bookNumber: 3, bookId: 'LEV', canEdit: false, chaptersWithDrafts: [1, 2], draftApplied: false }
  ];

  constructor(build: BuildDto | undefined = undefined) {
    when(mockedActivatedProjectService.changes$).thenReturn(of(this.mockProjectDoc));
    when(mockedActivatedProjectService.projectDoc).thenReturn(this.mockProjectDoc);
    when(mockedActivatedProjectService.projectId).thenReturn('project01');
    when(mockedUserService.currentUserId).thenReturn('user01');
    when(mockedProjectService.hasDraft(anything(), anything())).thenReturn(true);
    when(mockedProjectService.getProfile(anything())).thenResolve(this.mockProjectDoc);
    this.fixture = TestBed.createComponent(DraftPreviewBooksComponent);
    this.component = this.fixture.componentInstance;
    this.component.build = build;
    this.loader = TestbedHarnessEnvironment.loader(this.fixture);
    tick();
    this.fixture.detectChanges();
  }

  draftBookCount(): number {
    return this.fixture.nativeElement.querySelectorAll('.draft-book-button').length;
  }

  getBookButtonAtIndex(index: number): HTMLElement {
    return this.fixture.nativeElement.querySelectorAll('.draft-book-button')[index];
  }
}
