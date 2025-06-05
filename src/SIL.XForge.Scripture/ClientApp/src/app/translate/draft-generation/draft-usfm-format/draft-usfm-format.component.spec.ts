import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { MatRadioButtonHarness } from '@angular/material/radio/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { DraftUsfmConfig, ParagraphBreakFormat } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { of } from 'rxjs';
import { anything, deepEqual, mock, verify, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nService } from 'xforge-common/i18n.service';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { SF_TYPE_REGISTRY } from '../../../core/models/sf-type-registry';
import { SFProjectService } from '../../../core/sf-project.service';
import { ServalAdministrationService } from '../../../serval-administration/serval-administration.service';
import { SharedModule } from '../../../shared/shared.module';
import { EDITOR_READY_TIMEOUT } from '../../../shared/text/text.component';
import { DraftHandlingService } from '../draft-handling.service';
import { DraftUsfmFormatComponent } from './draft-usfm-format.component';

const mockedDraftHandlingService = mock(DraftHandlingService);
const mockedActivatedProjectService = mock(ActivatedProjectService);
const mockedProjectService = mock(SFProjectService);
const mockedUserService = mock(UserService);
const mockedServalAdministration = mock(ServalAdministrationService);
const mockedRouter = mock(Router);
const mockI18nService = mock(I18nService);
const mockedNoticeService = mock(NoticeService);
const mockedDialogService = mock(DialogService);

describe('DraftUsfmFormatComponent', () => {
  configureTestingModule(() => ({
    imports: [
      DraftUsfmFormatComponent,
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY),
      NoopAnimationsModule,
      TestTranslocoModule,
      TestOnlineStatusModule.forRoot(),
      SharedModule.forRoot()
    ],
    providers: [
      { provide: DraftHandlingService, useMock: mockedDraftHandlingService },
      { provide: ActivatedProjectService, useMock: mockedActivatedProjectService },
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: UserService, useMock: mockedUserService },
      { provide: ServalAdministrationService, useMock: mockedServalAdministration },
      { provide: Router, useMock: mockedRouter },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService },
      { provide: I18nService, useMock: mockI18nService },
      { provide: NoticeService, useMock: mockedNoticeService }
    ]
  }));

  it('shows message if user is not online', fakeAsync(async () => {
    const env = new TestEnvironment({ config: { paragraphFormat: ParagraphBreakFormat.MoveToEnd } });
    expect(env.offlineMessage).toBeNull();

    env.onlineStatusService.setIsOnline(false);
    tick();
    env.fixture.detectChanges();
    expect(env.offlineMessage).not.toBeNull();
    expect(env.harnesses?.length).toEqual(5);
    const isDisabled: boolean = await env.harnesses![0].isDisabled();
    expect(isDisabled).toBe(true);
  }));

  // Book and chapter changed
  it('navigates to a different book and chapter', fakeAsync(() => {
    const env = new TestEnvironment({ config: { paragraphFormat: ParagraphBreakFormat.MoveToEnd } });
    verify(mockedDraftHandlingService.getDraft(anything(), anything())).once();
    expect(env.component.chapters.length).toEqual(1);
    expect(env.component.booksWithDrafts.length).toEqual(2);

    env.component.bookChanged(2);
    tick();
    env.fixture.detectChanges();
    expect(env.component.chapters.length).toEqual(2);
    verify(mockedDraftHandlingService.getDraft(anything(), anything())).twice();

    env.component.chapterChanged(2);
    tick();
    env.fixture.detectChanges();
    verify(mockedDraftHandlingService.getDraft(anything(), anything())).thrice();
  }));

  it('should initialize with no paragraph format selected', fakeAsync(() => {
    const env = new TestEnvironment();
    expect(env.component.paragraphFormat.value).toBeNull();
  }));

  it('should show the currently selected format options', fakeAsync(() => {
    const env = new TestEnvironment({ config: { paragraphFormat: ParagraphBreakFormat.MoveToEnd } });
    expect(env.component.paragraphFormat.value).toBe(ParagraphBreakFormat.MoveToEnd);
  }));

  it('goes back if user chooses different configurations and then goes back', fakeAsync(async () => {
    const env = new TestEnvironment({ config: { paragraphFormat: ParagraphBreakFormat.MoveToEnd } });
    verify(mockedDraftHandlingService.getDraft(anything(), anything())).once();
    expect(env.harnesses?.length).toEqual(5);
    await env.harnesses![0].check();
    tick();
    env.fixture.detectChanges();
    verify(mockedProjectService.onlineSetUsfmConfig(env.projectId, anything())).never();
    verify(mockedDraftHandlingService.getDraft(anything(), anything())).twice();

    env.backButton.click();
    tick();
    env.fixture.detectChanges();
    verify(mockedProjectService.onlineSetUsfmConfig(env.projectId, anything())).never();
    verify(mockedRouter.navigate(deepEqual(['projects', env.projectId, 'draft-generation']))).once();
  }));

  it('should save changes to the draft format', fakeAsync(async () => {
    const env = new TestEnvironment({ config: { paragraphFormat: ParagraphBreakFormat.MoveToEnd } });
    verify(mockedDraftHandlingService.getDraft(anything(), anything())).once();
    expect(env.harnesses?.length).toEqual(5);
    await env.harnesses![0].check();
    tick();
    env.fixture.detectChanges();
    const config: DraftUsfmConfig = {
      paragraphFormat: ParagraphBreakFormat.BestGuess
    };
    verify(mockedProjectService.onlineSetUsfmConfig(env.projectId, anything())).never();
    verify(mockedDraftHandlingService.getDraft(anything(), anything())).twice();

    // redirect to generate draft
    env.saveButton.click();
    tick();
    env.fixture.detectChanges();
    verify(mockedProjectService.onlineSetUsfmConfig(env.projectId, deepEqual(config))).once();
    verify(mockedServalAdministration.onlineRetrievePreTranslationStatus(env.projectId)).once();
    verify(mockedRouter.navigate(deepEqual(['projects', env.projectId, 'draft-generation']))).never();
  }));

  it('should not save if format is empty', fakeAsync(() => {
    const env = new TestEnvironment();
    env.component.saveChanges();
    tick();
    env.fixture.detectChanges();
    expect(env.component.usfmFormatForm.valid).toBe(true);
    expect(env.component.paragraphFormat.value).toBeNull();
    verify(mockedProjectService.onlineSetUsfmConfig(anything(), anything())).never();
    verify(mockedServalAdministration.onlineRetrievePreTranslationStatus(anything())).never();
  }));
});

class TestEnvironment {
  component: DraftUsfmFormatComponent;
  fixture: ComponentFixture<DraftUsfmFormatComponent>;
  harnesses?: MatRadioButtonHarness[];
  readonly projectId = 'project01';
  onlineStatusService: TestOnlineStatusService;

  constructor(args: { config?: DraftUsfmConfig } = {}) {
    const userDoc = mock(UserDoc);
    this.onlineStatusService = TestBed.inject(OnlineStatusService) as TestOnlineStatusService;

    when(mockedUserService.getCurrentUser()).thenResolve(userDoc);
    when(mockedDraftHandlingService.getDraft(anything(), anything())).thenReturn(
      of([
        { insert: { chapter: { number: 1 } }, attributes: { style: 'c' } },
        { insert: { verse: { number: 1 } }, attributes: { style: 'v' } },
        { insert: 'Verse 1 text.' }
      ])
    );
    this.onlineStatusService.setIsOnline(true);
    when(mockedNoticeService.show(anything())).thenResolve();
    when(mockedDialogService.confirm(anything(), anything(), anything())).thenResolve(true);
    this.setupProject(args.config);
    this.fixture = TestBed.createComponent(DraftUsfmFormatComponent);
    this.component = this.fixture.componentInstance;
    const loader = TestbedHarnessEnvironment.loader(this.fixture);
    loader.getAllHarnesses(MatRadioButtonHarness).then(harnesses => (this.harnesses = harnesses));
    tick(EDITOR_READY_TIMEOUT);
    this.fixture.detectChanges();
  }

  get backButton(): HTMLElement {
    return this.fixture.nativeElement.querySelector('.back');
  }

  get saveButton(): HTMLElement {
    return this.fixture.nativeElement.querySelector('.save');
  }

  get offlineMessage(): HTMLElement | null {
    return this.fixture.nativeElement.querySelector('.offline-text');
  }

  setupProject(config?: DraftUsfmConfig): void {
    const texts: TextInfo[] = [
      {
        bookNum: 1,
        chapters: [{ number: 1, lastVerse: 20, isValid: true, permissions: {}, hasDraft: true }],
        hasSource: true,
        permissions: {}
      },
      {
        bookNum: 2,
        chapters: [
          { number: 1, lastVerse: 20, isValid: true, permissions: {}, hasDraft: true },
          { number: 2, lastVerse: 20, isValid: true, permissions: {}, hasDraft: true }
        ],
        hasSource: true,
        permissions: {}
      },
      {
        bookNum: 3,
        chapters: [{ number: 1, lastVerse: 20, isValid: true, permissions: {} }],
        hasSource: true,
        permissions: {}
      }
    ];
    const projectDoc = {
      id: this.projectId,
      data: createTestProjectProfile({ translateConfig: { draftConfig: { usfmConfig: config } }, texts })
    } as SFProjectProfileDoc;
    when(mockedActivatedProjectService.projectId).thenReturn(this.projectId);
    when(mockedActivatedProjectService.projectDoc$).thenReturn(of(projectDoc));
    when(mockedActivatedProjectService.projectDoc).thenReturn(projectDoc);
  }
}
