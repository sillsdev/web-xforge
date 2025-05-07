import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { MatCheckboxHarness } from '@angular/material/checkbox/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { DraftUsfmConfig } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { of } from 'rxjs';
import { anything, deepEqual, mock, verify, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { I18nService } from 'xforge-common/i18n.service';
import { UserDoc } from 'xforge-common/models/user-doc';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { SF_TYPE_REGISTRY } from '../../../core/models/sf-type-registry';
import { SFProjectService } from '../../../core/sf-project.service';
import { ServalAdministrationService } from '../../../serval-administration/serval-administration.service';
import { EDITOR_READY_TIMEOUT } from '../../../shared/text/text.component';
import { DraftHandlingService } from '../draft-handling.service';
import { DraftUsfmFormatComponent } from './draft-usfm-format.component';

const mockedDraftHandlingService = mock(DraftHandlingService);
const mockedActivatedProjectService = mock(ActivatedProjectService);
const mockedProjectService = mock(SFProjectService);
const mockedUserService = mock(UserService);
const mockedServalAdministration = mock(ServalAdministrationService);
const mockedRouter = mock(Router);
const mockedOnlineStatusService = mock(OnlineStatusService);
const mockI18nService = mock(I18nService);

describe('DraftUsfmFormatComponent', () => {
  configureTestingModule(() => ({
    imports: [
      DraftUsfmFormatComponent,
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY),
      NoopAnimationsModule,
      TestTranslocoModule
    ],
    providers: [
      { provide: DraftHandlingService, useMock: mockedDraftHandlingService },
      { provide: ActivatedProjectService, useMock: mockedActivatedProjectService },
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: UserService, useMock: mockedUserService },
      { provide: ServalAdministrationService, useMock: mockedServalAdministration },
      { provide: Router, useMock: mockedRouter },
      { provide: OnlineStatusService, useMock: mockedOnlineStatusService },
      { provide: I18nService, useMock: mockI18nService }
    ]
  }));

  it('shows message if user is not online', fakeAsync(() => {
    const env = new TestEnvironment();
    expect(env.offlineMessage).toBeNull();

    when(mockedOnlineStatusService.isOnline).thenReturn(false);
    tick();
    env.fixture.detectChanges();
    expect(env.offlineMessage).not.toBeNull();
  }));

  // TODO: No draft available

  // Book and chapter changed
  it('navigates to a different book and chapter', fakeAsync(() => {
    const env = new TestEnvironment();
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

  it('should show the currently selected format options', fakeAsync(() => {
    const config: DraftUsfmConfig = {
      preserveParagraphMarkers: true,
      preserveStyleMarkers: false,
      preserveEmbedMarkers: false
    };
    const env = new TestEnvironment({ config });
    expect(env.component.usfmFormatForm.controls.preserveParagraphs.value).toBe(true);
    expect(env.component.usfmFormatForm.controls.preserveStyles.value).toBe(false);
    expect(env.component.usfmFormatForm.controls.preserveEmbeds.value).toBe(false);
  }));

  it('cancels if user chooses different configurations and then cancels', fakeAsync(async () => {
    const env = new TestEnvironment();
    verify(mockedDraftHandlingService.getDraft(anything(), anything())).once();
    expect(env.harnesses?.length).toEqual(3);
    await env.harnesses![0].uncheck();
    tick();
    env.fixture.detectChanges();
    verify(mockedProjectService.onlineSetUsfmConfig(env.projectId, anything())).never();
    verify(mockedDraftHandlingService.getDraft(anything(), anything())).twice();

    env.cancelButton.click();
    tick();
    env.fixture.detectChanges();
    verify(mockedProjectService.onlineSetUsfmConfig(env.projectId, anything())).never();
    verify(mockedRouter.navigate(deepEqual(['projects', env.projectId, 'draft-generation']))).once();
  }));

  it('should save changes to the draft format', fakeAsync(async () => {
    const env = new TestEnvironment();
    verify(mockedDraftHandlingService.getDraft(anything(), anything())).once();
    expect(env.harnesses?.length).toEqual(3);
    await env.harnesses![0].uncheck();
    tick();
    env.fixture.detectChanges();
    const config: DraftUsfmConfig = {
      preserveParagraphMarkers: false,
      preserveStyleMarkers: false,
      preserveEmbedMarkers: true
    };
    verify(mockedProjectService.onlineSetUsfmConfig(env.projectId, anything())).never();
    verify(mockedDraftHandlingService.getDraft(anything(), anything())).twice();

    // redirect to generate draft
    env.saveButton.click();
    tick();
    env.fixture.detectChanges();
    verify(mockedProjectService.onlineSetUsfmConfig(env.projectId, deepEqual(config))).once();
    verify(mockedServalAdministration.onlineRetrievePreTranslationStatus(env.projectId)).once();
    verify(mockedRouter.navigate(deepEqual(['projects', env.projectId, 'draft-generation']))).once();
  }));
});

class TestEnvironment {
  component: DraftUsfmFormatComponent;
  fixture: ComponentFixture<DraftUsfmFormatComponent>;
  harnesses?: MatCheckboxHarness[];
  readonly projectId = 'project01';

  constructor(args: { config?: DraftUsfmConfig } = {}) {
    const userDoc = mock(UserDoc);

    when(mockedUserService.getCurrentUser()).thenResolve(userDoc);
    when(mockedOnlineStatusService.onlineStatus$).thenReturn(of(true));
    when(mockedDraftHandlingService.getDraft(anything(), anything())).thenReturn(
      of([
        { insert: { chapter: { number: 1 } }, attributes: { style: 'c' } },
        { insert: { verse: { number: 1 } }, attributes: { style: 'v' } },
        { insert: 'Verse 1 text.' }
      ])
    );
    when(mockedOnlineStatusService.isOnline).thenReturn(true);
    this.setupProject(args.config);
    this.fixture = TestBed.createComponent(DraftUsfmFormatComponent);
    this.component = this.fixture.componentInstance;
    const loader = TestbedHarnessEnvironment.loader(this.fixture);
    loader.getAllHarnesses(MatCheckboxHarness).then(harnesses => (this.harnesses = harnesses));
    tick(EDITOR_READY_TIMEOUT);
    this.fixture.detectChanges();
  }

  get cancelButton(): HTMLElement {
    return this.fixture.nativeElement.querySelector('.cancel');
  }

  get saveButton(): HTMLElement {
    return this.fixture.nativeElement.querySelector('.save');
  }

  get offlineMessage(): HTMLElement | null {
    return this.fixture.nativeElement.querySelector('.offline-text');
  }

  setupProject(config?: DraftUsfmConfig): void {
    config ??= {
      preserveParagraphMarkers: true,
      preserveStyleMarkers: false,
      preserveEmbedMarkers: true
    };
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
