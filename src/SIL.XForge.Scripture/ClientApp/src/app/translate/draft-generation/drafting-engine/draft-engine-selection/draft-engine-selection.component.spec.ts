import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { Router } from '@angular/router';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { DraftingEngine } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { BehaviorSubject } from 'rxjs';
import { anything, deepEqual, mock, verify, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { ExternalUrlService } from 'xforge-common/external-url.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { provideTestOnlineStatus } from 'xforge-common/test-online-status-providers';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { configureTestingModule, getTestTranslocoModule } from 'xforge-common/test-utils';
import { SFProjectProfileDoc } from '../../../../core/models/sf-project-profile-doc';
import { SFProjectService } from '../../../../core/sf-project.service';
import { DraftEngineSelectionComponent } from './draft-engine-selection.component';

const mockedActivatedProjectService = mock(ActivatedProjectService);
const mockedProjectService = mock(SFProjectService);
const mockedRouter = mock(Router);
const mockedExternalUrlService = mock(ExternalUrlService);

describe('DraftEngineSelectionComponent', () => {
  configureTestingModule(() => ({
    imports: [DraftEngineSelectionComponent, getTestTranslocoModule()],
    providers: [
      provideTestOnlineStatus(),
      { provide: OnlineStatusService, useClass: TestOnlineStatusService },
      { provide: ActivatedProjectService, useMock: mockedActivatedProjectService },
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: Router, useMock: mockedRouter },
      { provide: ExternalUrlService, useMock: mockedExternalUrlService }
    ]
  }));

  it('offers only the engines available to the project, with the current one selected', () => {
    const env = new TestEnvironment({
      availableEngines: [DraftingEngine.Nmt, DraftingEngine.Llm],
      selectedEngine: DraftingEngine.Llm
    });

    expect(env.component.availableEngines).toEqual([DraftingEngine.Nmt, DraftingEngine.Llm]);
    expect(env.component.selectedEngine).toBe(DraftingEngine.Llm);
    expect(env.engineCards.length).toBe(2);
  });

  it('says which engines draft one book at a time and send text to a third party', () => {
    const env = new TestEnvironment({
      availableEngines: [DraftingEngine.Nmt, DraftingEngine.NmtWithLlmPostProcessing]
    });

    expect(env.engineCards[0].querySelector('.one-book-at-a-time')).toBeNull();
    expect(env.engineCards[0].querySelector('.third-party')).toBeNull();
    expect(env.engineCards[1].querySelector('.one-book-at-a-time')).not.toBeNull();
    expect(env.engineCards[1].querySelector('.third-party')).not.toBeNull();
  });

  it('selects an engine when its card is clicked', () => {
    const env = new TestEnvironment({ availableEngines: [DraftingEngine.Nmt, DraftingEngine.Llm] });

    env.engineCards[1].click();
    env.fixture.detectChanges();

    expect(env.component.selectedEngine).toBe(DraftingEngine.Llm);
    expect(env.engineCards[1].classList).toContain('selected');
    expect(env.engineCards[0].classList).not.toContain('selected');
  });

  it('asks for acknowledgement of data sharing only while an engine that uses an LLM is selected', () => {
    const env = new TestEnvironment({ availableEngines: [DraftingEngine.Nmt, DraftingEngine.Llm] });
    expect(env.acknowledgement).toBeNull();

    env.component.selectEngine(DraftingEngine.Llm);
    env.fixture.detectChanges();

    expect(env.acknowledgement).not.toBeNull();
    expect(env.acknowledgement!.querySelector('a.learn-more')).not.toBeNull();
    // The user is not told off before they have tried to save.
    expect(env.acknowledgementRequired).toBeNull();
  });

  it('explains what is needed, rather than saving, when data sharing has not been acknowledged', fakeAsync(() => {
    const env = new TestEnvironment({ availableEngines: [DraftingEngine.Nmt, DraftingEngine.Llm] });
    env.component.selectEngine(DraftingEngine.Llm);
    env.fixture.detectChanges();
    // The button can be clicked, so that clicking it can say what is missing.
    expect(env.saveButton.disabled).toBeFalse();

    env.saveButton.click();
    tick();
    env.fixture.detectChanges();

    expect(env.acknowledgementRequired).not.toBeNull();
    verify(mockedProjectService.onlineSetDraftingEngine(anything(), anything())).never();
    verify(mockedRouter.navigate(anything())).never();
  }));

  it('stops explaining as soon as data sharing is acknowledged, and then saves', fakeAsync(async () => {
    const env = new TestEnvironment({ availableEngines: [DraftingEngine.Nmt, DraftingEngine.Llm] });
    env.component.selectEngine(DraftingEngine.Llm);
    await env.component.save();
    tick();
    env.fixture.detectChanges();
    expect(env.acknowledgementRequired).not.toBeNull();

    env.component.hasAcknowledgedDataSharing = true;
    env.fixture.detectChanges();
    expect(env.acknowledgementRequired).toBeNull();

    await env.component.save();
    tick();
    verify(mockedProjectService.onlineSetDraftingEngine('project01', DraftingEngine.Llm)).once();
  }));

  it('asks for acknowledgement again, without an error, when a different engine is selected', fakeAsync(async () => {
    const env = new TestEnvironment({
      availableEngines: [DraftingEngine.Nmt, DraftingEngine.NmtWithLlmPostProcessing, DraftingEngine.Llm],
      selectedEngine: DraftingEngine.NmtWithLlmPostProcessing
    });
    await env.component.save();
    tick();
    expect(env.component.showAcknowledgementRequired).toBeTrue();
    env.component.hasAcknowledgedDataSharing = true;

    env.component.selectEngine(DraftingEngine.Llm);

    expect(env.component.hasAcknowledgedDataSharing).toBeFalse();
    expect(env.component.showAcknowledgementRequired).toBeFalse();
  }));

  it('saves the chosen engine and returns to the draft page', fakeAsync(async () => {
    const env = new TestEnvironment({
      availableEngines: [DraftingEngine.Nmt, DraftingEngine.Llm],
      selectedEngine: DraftingEngine.Llm
    });
    env.component.selectEngine(DraftingEngine.Nmt);

    await env.component.save();
    tick();

    verify(mockedProjectService.onlineSetDraftingEngine('project01', DraftingEngine.Nmt)).once();
    verify(mockedRouter.navigate(deepEqual(['/projects', 'project01', 'draft-generation']))).once();
    expect(env.component.saving).toBeFalse();
  }));

  it('returns to the draft page without saving when the engine was not changed', fakeAsync(async () => {
    const env = new TestEnvironment({ availableEngines: [DraftingEngine.Nmt, DraftingEngine.Llm] });

    await env.component.save();
    tick();

    verify(mockedProjectService.onlineSetDraftingEngine(anything(), anything())).never();
    verify(mockedRouter.navigate(deepEqual(['/projects', 'project01', 'draft-generation']))).once();
    expect().nothing();
  }));

  it('stays on the page when the engine could not be saved', fakeAsync(() => {
    const env = new TestEnvironment({ availableEngines: [DraftingEngine.Nmt, DraftingEngine.Llm] });
    when(mockedProjectService.onlineSetDraftingEngine(anything(), anything())).thenReject(new Error('not allowed'));
    env.component.selectEngine(DraftingEngine.Llm);
    env.component.hasAcknowledgedDataSharing = true;

    let error: unknown;
    env.component.save().catch((e: unknown) => (error = e));
    tick();

    expect(error).toBeDefined();
    verify(mockedRouter.navigate(anything())).never();
    expect(env.component.saving).toBeFalse();
  }));

  it('returns to the draft page without saving when cancelled', () => {
    const env = new TestEnvironment({ availableEngines: [DraftingEngine.Nmt, DraftingEngine.Llm] });
    env.component.selectEngine(DraftingEngine.Llm);

    env.component.navigateToDrafting();

    verify(mockedProjectService.onlineSetDraftingEngine(anything(), anything())).never();
    verify(mockedRouter.navigate(deepEqual(['/projects', 'project01', 'draft-generation']))).once();
    expect().nothing();
  });

  it('cannot save while offline, and says why', fakeAsync(async () => {
    const env = new TestEnvironment({ availableEngines: [DraftingEngine.Nmt, DraftingEngine.Llm] });
    env.component.selectEngine(DraftingEngine.Nmt);
    expect(env.offlineNotice).toBeNull();

    env.onlineStatusService.setIsOnline(false);
    env.fixture.detectChanges();

    expect(env.offlineNotice).not.toBeNull();
    expect(env.saveButton.disabled).toBeTrue();
    await env.component.save();
    tick();
    verify(mockedRouter.navigate(anything())).never();
  }));

  it('keeps the choice made on the page when the project changes, unless that engine is no longer available', () => {
    const env = new TestEnvironment({
      availableEngines: [DraftingEngine.Nmt, DraftingEngine.NmtWithLlmPostProcessing, DraftingEngine.Llm]
    });
    env.component.selectEngine(DraftingEngine.Llm);

    env.setProject({
      availableEngines: [DraftingEngine.Nmt, DraftingEngine.NmtWithLlmPostProcessing, DraftingEngine.Llm],
      selectedEngine: DraftingEngine.NmtWithLlmPostProcessing
    });
    expect(env.component.selectedEngine).toBe(DraftingEngine.Llm);

    env.setProject({
      availableEngines: [DraftingEngine.Nmt, DraftingEngine.NmtWithLlmPostProcessing],
      selectedEngine: DraftingEngine.NmtWithLlmPostProcessing
    });
    expect(env.component.selectedEngine).toBe(DraftingEngine.NmtWithLlmPostProcessing);
    expect(env.engineCards.length).toBe(2);
  });
});

/** The engines stored for a test project. */
interface TestProjectEngines {
  availableEngines: DraftingEngine[];
  selectedEngine?: DraftingEngine;
}

/** Provides helpers for constructing test data for DraftEngineSelectionComponent tests. */
class TestEnvironment {
  readonly fixture: ComponentFixture<DraftEngineSelectionComponent>;
  readonly component: DraftEngineSelectionComponent;
  readonly onlineStatusService: TestOnlineStatusService = TestBed.inject(
    OnlineStatusService
  ) as TestOnlineStatusService;
  private readonly projectDoc$ = new BehaviorSubject<SFProjectProfileDoc | undefined>(undefined);

  constructor(project: TestProjectEngines) {
    when(mockedActivatedProjectService.projectId).thenReturn('project01');
    when(mockedActivatedProjectService.changes$).thenReturn(this.projectDoc$);
    when(mockedProjectService.onlineSetDraftingEngine(anything(), anything())).thenResolve();
    when(mockedExternalUrlService.understandingDrafts).thenReturn('https://example.com/help');
    this.projectDoc$.next(TestEnvironment.createProjectDoc(project));
    this.fixture = TestBed.createComponent(DraftEngineSelectionComponent);
    this.component = this.fixture.componentInstance;
    this.fixture.detectChanges();
  }

  get engineCards(): HTMLElement[] {
    return Array.from(this.fixture.nativeElement.querySelectorAll('.engine-option'));
  }

  get acknowledgement(): HTMLElement | null {
    return this.fixture.nativeElement.querySelector('.acknowledgement');
  }

  get acknowledgementRequired(): HTMLElement | null {
    return this.fixture.nativeElement.querySelector('.acknowledgement-required');
  }

  get offlineNotice(): HTMLElement | null {
    return this.fixture.nativeElement.querySelector('.offline-notice');
  }

  get saveButton(): HTMLButtonElement {
    return this.fixture.nativeElement.querySelector('.save-button');
  }

  setProject(project: TestProjectEngines): void {
    this.projectDoc$.next(TestEnvironment.createProjectDoc(project));
    this.fixture.detectChanges();
  }

  private static createProjectDoc({ availableEngines, selectedEngine }: TestProjectEngines): SFProjectProfileDoc {
    return {
      id: 'project01',
      data: createTestProjectProfile({
        translateConfig: {
          draftConfig: { availableDraftingEngines: availableEngines, draftingEngine: selectedEngine }
        }
      })
    } as SFProjectProfileDoc;
  }
}
