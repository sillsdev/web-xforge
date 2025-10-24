import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { Location } from '@angular/common';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { MatRadioButtonHarness } from '@angular/material/radio/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import {
  DraftUsfmConfig,
  ParagraphBreakFormat,
  QuoteFormat
} from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { of } from 'rxjs';
import { anything, deepEqual, mock, verify, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nService } from 'xforge-common/i18n.service';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { provideTestOnlineStatus } from 'xforge-common/test-online-status-providers';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { provideTestRealtime } from 'xforge-common/test-realtime-providers';
import { configureTestingModule, getTestTranslocoModule } from 'xforge-common/test-utils';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { SF_TYPE_REGISTRY } from '../../../core/models/sf-type-registry';
import { SFProjectService } from '../../../core/sf-project.service';
import { BuildDto } from '../../../machine-api/build-dto';
import { BuildStates } from '../../../machine-api/build-states';
import { QuotationAnalysis } from '../../../machine-api/quotation-denormalization';
import { ServalAdministrationService } from '../../../serval-administration/serval-administration.service';
import { provideQuillRegistrations } from '../../../shared/text/quill-editor-registration/quill-providers';
import { EDITOR_READY_TIMEOUT } from '../../../shared/text/text.component';
import { DraftGenerationService } from '../draft-generation.service';
import { DraftHandlingService } from '../draft-handling.service';
import { DraftUsfmFormatComponent } from './draft-usfm-format.component';

const mockedActivatedRoute = mock(ActivatedRoute);
const mockedDraftHandlingService = mock(DraftHandlingService);
const mockedDraftGenerationService = mock(DraftGenerationService);
const mockedActivatedProjectService = mock(ActivatedProjectService);
const mockedProjectService = mock(SFProjectService);
const mockedUserService = mock(UserService);
const mockedServalAdministration = mock(ServalAdministrationService);
const mockedLocation = mock(Location);
const mockI18nService = mock(I18nService);
const mockedNoticeService = mock(NoticeService);
const mockedDialogService = mock(DialogService);

describe('DraftUsfmFormatComponent', () => {
  configureTestingModule(() => ({
    imports: [DraftUsfmFormatComponent, getTestTranslocoModule()],
    providers: [
      provideQuillRegistrations(),
      provideTestRealtime(SF_TYPE_REGISTRY),
      provideTestOnlineStatus(),
      { provide: DraftHandlingService, useMock: mockedDraftHandlingService },
      { provide: DraftGenerationService, useMock: mockedDraftGenerationService },
      { provide: ActivatedProjectService, useMock: mockedActivatedProjectService },
      { provide: ActivatedRoute, useMock: mockedActivatedRoute },
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: UserService, useMock: mockedUserService },
      { provide: ServalAdministrationService, useMock: mockedServalAdministration },
      { provide: Location, useMock: mockedLocation },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService },
      { provide: I18nService, useMock: mockI18nService },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: DialogService, useMock: mockedDialogService },
      provideNoopAnimations()
    ]
  }));

  beforeEach(() => {
    when(mockedActivatedRoute.params).thenReturn(of({}));
  });

  it('shows message if user is not online', fakeAsync(async () => {
    const env = new TestEnvironment({
      config: { paragraphFormat: ParagraphBreakFormat.MoveToEnd, quoteFormat: QuoteFormat.Denormalized }
    });
    expect(env.offlineMessage).toBeNull();

    env.onlineStatusService.setIsOnline(false);
    tick();
    env.fixture.detectChanges();
    expect(env.offlineMessage).not.toBeNull();
    expect(env.harnesses?.length).toEqual(5);
    const isDisabled: boolean = await env.harnesses![0].isDisabled();
    expect(isDisabled).toBe(true);
  }));

  it('navigates to book and chapter from route params', fakeAsync(() => {
    when(mockedActivatedRoute.params).thenReturn(of({ bookId: 'EXO', chapter: '2' }));
    const env = new TestEnvironment();
    tick(EDITOR_READY_TIMEOUT);
    env.fixture.detectChanges();
    tick(EDITOR_READY_TIMEOUT);
    expect(env.component.bookNum).toBe(2);
    expect(env.component.chapterNum).toBe(2);
    verify(mockedDraftHandlingService.getDraft(anything(), anything())).once();
  }));

  // Book and chapter changed
  it('navigates to a different book and chapter', fakeAsync(() => {
    const env = new TestEnvironment({
      config: { paragraphFormat: ParagraphBreakFormat.MoveToEnd, quoteFormat: QuoteFormat.Denormalized }
    });
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

  it('should initialize and default to best guess and automatic quotes', fakeAsync(async () => {
    const env = new TestEnvironment({ quotationAnalysis: QuotationAnalysis.Successful });
    expect(env.component.paragraphFormat.value).toBe(ParagraphBreakFormat.BestGuess);
    expect(env.component.quoteFormat.value).toBe(QuoteFormat.Denormalized);
    expect(await env.component.confirmLeave()).toBe(true);
    expect(env.quoteFormatWarning).toBeNull();
  }));

  it('should show the currently selected format options', fakeAsync(() => {
    const env = new TestEnvironment({
      config: { paragraphFormat: ParagraphBreakFormat.MoveToEnd, quoteFormat: QuoteFormat.Normalized }
    });
    expect(env.component.paragraphFormat.value).toBe(ParagraphBreakFormat.MoveToEnd);
    expect(env.component.quoteFormat.value).toBe(QuoteFormat.Normalized);
  }));

  it('goes back if user chooses different configurations and then goes back', fakeAsync(async () => {
    const env = new TestEnvironment({
      config: { paragraphFormat: ParagraphBreakFormat.MoveToEnd, quoteFormat: QuoteFormat.Denormalized }
    });
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
    // user will be prompted that there are unsaved changes
    expect(await env.component.confirmLeave()).toBe(true);
    verify(mockedProjectService.onlineSetUsfmConfig(env.projectId, anything())).never();
    verify(mockedLocation.back()).once();
  }));

  it('should save changes to the draft format', fakeAsync(async () => {
    const env = new TestEnvironment({
      config: { paragraphFormat: ParagraphBreakFormat.MoveToEnd, quoteFormat: QuoteFormat.Denormalized }
    });
    verify(mockedDraftHandlingService.getDraft(anything(), anything())).once();
    expect(env.harnesses?.length).toEqual(5);
    await env.harnesses![0].check();
    tick();
    env.fixture.detectChanges();
    const config: DraftUsfmConfig = {
      paragraphFormat: ParagraphBreakFormat.BestGuess,
      quoteFormat: QuoteFormat.Denormalized
    };
    verify(mockedProjectService.onlineSetUsfmConfig(env.projectId, anything())).never();
    verify(mockedDraftHandlingService.getDraft(anything(), anything())).twice();

    // redirect to generate draft
    env.saveButton.click();
    tick();
    env.fixture.detectChanges();
    verify(mockedProjectService.onlineSetUsfmConfig(env.projectId, deepEqual(config))).once();
    verify(mockedServalAdministration.onlineRetrievePreTranslationStatus(env.projectId)).once();
    verify(mockedLocation.back()).once();
  }));

  it('should not save if format is empty', fakeAsync(() => {
    const env = new TestEnvironment();
    env.component.paragraphFormat.setValue(null);
    tick();
    env.fixture.detectChanges();
    env.component.saveChanges();
    tick();
    env.fixture.detectChanges();
    expect(env.component.usfmFormatForm.valid).toBe(true);
    expect(env.component.paragraphFormat.value).toBeNull();
    verify(mockedProjectService.onlineSetUsfmConfig(anything(), anything())).never();
    verify(mockedServalAdministration.onlineRetrievePreTranslationStatus(anything())).never();
  }));

  it('shows a notice if unable to detect the quote convention for the project', fakeAsync(() => {
    const env = new TestEnvironment({ quotationAnalysis: QuotationAnalysis.Unsuccessful });
    expect(env.quoteFormatWarning).not.toBeNull();
  }));
});

class TestEnvironment {
  component: DraftUsfmFormatComponent;
  fixture: ComponentFixture<DraftUsfmFormatComponent>;
  harnesses?: MatRadioButtonHarness[];
  readonly projectId = 'project01';
  onlineStatusService: TestOnlineStatusService;

  constructor(args: { config?: DraftUsfmConfig; quotationAnalysis?: QuotationAnalysis } = {}) {
    const userDoc = mock(UserDoc);
    this.onlineStatusService = TestBed.inject(OnlineStatusService) as TestOnlineStatusService;
    when(mockedDraftGenerationService.getLastCompletedBuild(anything())).thenReturn(
      of(this.getTestBuildDto(args.quotationAnalysis ?? QuotationAnalysis.Successful))
    );
    when(mockedUserService.getCurrentUser()).thenResolve(userDoc);
    when(mockedDraftHandlingService.getDraft(anything(), anything())).thenReturn(
      of([
        { insert: { chapter: { number: 1 } }, attributes: { style: 'c' } },
        { insert: { verse: { number: 1 } }, attributes: { style: 'v' } },
        { insert: 'Verse 1 text.' }
      ])
    );
    when(mockedActivatedProjectService.projectId$).thenReturn(of(this.projectId));
    when(mockedDraftHandlingService.draftDataToOps(anything(), anything())).thenCall(ops => ops);
    this.onlineStatusService.setIsOnline(true);
    when(mockedNoticeService.show(anything())).thenResolve();
    when(mockedDialogService.confirm(anything(), anything(), anything())).thenResolve(true);
    when(mockedServalAdministration.onlineRetrievePreTranslationStatus(anything())).thenResolve();
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

  get quoteFormatWarning(): HTMLElement | null {
    return this.fixture.nativeElement.querySelector('.quote-format-warning');
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

  private getTestBuildDto(quotationAnalysis: QuotationAnalysis): BuildDto {
    return {
      id: 'build01',
      state: BuildStates.Completed,
      message: '',
      queueDepth: 0,
      href: '',
      percentCompleted: 1.0,
      engine: { id: 'source01', href: '' },
      revision: 1,
      additionalInfo: {
        dateRequested: new Date().toISOString(),
        buildId: 'build01',
        step: 123,
        translationEngineId: 'engine01',
        translationScriptureRanges: [{ projectId: 'source01', scriptureRange: 'EXO' }],
        trainingScriptureRanges: [{ projectId: 'source01', scriptureRange: 'GEN' }],
        trainingDataFileIds: [] as string[],
        quotationDenormalization: quotationAnalysis
      }
    };
  }
}
