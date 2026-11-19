import { ComponentFixture, TestBed } from '@angular/core/testing';
import { configureTestingModule, getTestTranslocoModule } from 'xforge-common/test-utils';
import { DraftingEngine } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { anything, deepEqual, instance, mock, verify, when } from 'ts-mockito';
import {
  DraftingEngineAvailabilityComponent,
  saveDraftingEngineAvailability
} from './drafting-engine-availability.component';
import { SFProjectService } from '../../core/sf-project.service';
import {
  DEFAULT_DRAFTING_ENGINE_AVAILABILITY,
  DraftingEngineAvailability
} from '../../translate/draft-generation/drafting-engine/drafting-engine';

describe('DraftingEngineAvailabilityComponent', () => {
  configureTestingModule(() => ({ imports: [DraftingEngineAvailabilityComponent, getTestTranslocoModule()] }));

  it('shows an availability checkbox and a selection radio button for every engine', () => {
    const env = new TestEnvironment({
      availableEngines: [DraftingEngine.Nmt, DraftingEngine.Llm],
      selectedEngine: DraftingEngine.Nmt
    });

    // Engines have the names that end users see.
    expect(env.engineLabels).toEqual(['Core Drafting', 'Core with Refinements', 'Frontier Drafting']);
    expect(env.fixture.nativeElement.querySelectorAll('.engine-available').length).toBe(3);
    expect(env.fixture.nativeElement.querySelectorAll('.engine-selected').length).toBe(3);
    expect(env.component.isAvailable(DraftingEngine.Nmt)).toBeTrue();
    expect(env.component.isAvailable(DraftingEngine.NmtWithLlmPostProcessing)).toBeFalse();
  });

  it('makes an engine available, keeping the engines in a fixed order and the selected engine', () => {
    const env = new TestEnvironment({
      availableEngines: [DraftingEngine.Nmt, DraftingEngine.Llm],
      selectedEngine: DraftingEngine.Llm
    });

    env.component.onAvailableChange(DraftingEngine.NmtWithLlmPostProcessing, true);

    expect(env.emitted).toEqual([
      {
        availableEngines: [DraftingEngine.Nmt, DraftingEngine.NmtWithLlmPostProcessing, DraftingEngine.Llm],
        selectedEngine: DraftingEngine.Llm
      }
    ]);
  });

  it('does not allow NLLB to be made unavailable', () => {
    const env = new TestEnvironment({
      availableEngines: [DraftingEngine.Nmt, DraftingEngine.Llm],
      selectedEngine: DraftingEngine.Llm
    });

    expect(env.component.isAlwaysAvailable(DraftingEngine.Nmt)).toBeTrue();
    expect(env.component.isAlwaysAvailable(DraftingEngine.Llm)).toBeFalse();
    env.component.onAvailableChange(DraftingEngine.Nmt, false);

    expect(env.emitted).toEqual([]);
    const nllbCheckbox: HTMLInputElement = env.fixture.nativeElement.querySelector('.engine-available input');
    expect(nllbCheckbox.checked).toBeTrue();
    expect(nllbCheckbox.disabled).toBeTrue();
  });

  it('selects NLLB when the selected engine is made unavailable', () => {
    const env = new TestEnvironment({
      availableEngines: [DraftingEngine.Nmt, DraftingEngine.NmtWithLlmPostProcessing, DraftingEngine.Llm],
      selectedEngine: DraftingEngine.Llm
    });

    env.component.onAvailableChange(DraftingEngine.Llm, false);

    expect(env.emitted).toEqual([
      {
        availableEngines: [DraftingEngine.Nmt, DraftingEngine.NmtWithLlmPostProcessing],
        selectedEngine: DraftingEngine.Nmt
      }
    ]);
  });

  it('selects an engine', () => {
    const env = new TestEnvironment({
      availableEngines: [DraftingEngine.Nmt, DraftingEngine.Llm],
      selectedEngine: DraftingEngine.Nmt
    });

    env.component.onSelectedChange(DraftingEngine.Llm);

    expect(env.emitted).toEqual([
      { availableEngines: [DraftingEngine.Nmt, DraftingEngine.Llm], selectedEngine: DraftingEngine.Llm }
    ]);
  });
});

describe('saveDraftingEngineAvailability', () => {
  it('saves the available engines before the selected engine, which the server requires to be available', async () => {
    const mockedProjectService = mock(SFProjectService);
    const calls: string[] = [];
    when(mockedProjectService.onlineSetAvailableDraftingEngines(anything(), anything())).thenCall(async () => {
      calls.push('available');
    });
    when(mockedProjectService.onlineSetDraftingEngine(anything(), anything())).thenCall(async () => {
      calls.push('selected');
    });

    await saveDraftingEngineAvailability(
      instance(mockedProjectService),
      'project01',
      DEFAULT_DRAFTING_ENGINE_AVAILABILITY,
      { availableEngines: [DraftingEngine.Nmt, DraftingEngine.Llm], selectedEngine: DraftingEngine.Llm }
    );

    expect(calls).toEqual(['available', 'selected']);
    verify(
      mockedProjectService.onlineSetAvailableDraftingEngines(
        'project01',
        deepEqual([DraftingEngine.Nmt, DraftingEngine.Llm])
      )
    ).once();
    verify(mockedProjectService.onlineSetDraftingEngine('project01', DraftingEngine.Llm)).once();
  });

  it('saves nothing when nothing changed', async () => {
    const mockedProjectService = mock(SFProjectService);

    await saveDraftingEngineAvailability(
      instance(mockedProjectService),
      'project01',
      { availableEngines: [DraftingEngine.Nmt, DraftingEngine.Llm], selectedEngine: DraftingEngine.Llm },
      { availableEngines: [DraftingEngine.Nmt, DraftingEngine.Llm], selectedEngine: DraftingEngine.Llm }
    );

    verify(mockedProjectService.onlineSetAvailableDraftingEngines(anything(), anything())).never();
    verify(mockedProjectService.onlineSetDraftingEngine(anything(), anything())).never();
    expect().nothing();
  });

  it('does not save the selected engine when the available engines could not be saved', async () => {
    const mockedProjectService = mock(SFProjectService);
    when(mockedProjectService.onlineSetAvailableDraftingEngines(anything(), anything())).thenReject(
      new Error('forbidden')
    );

    await expectAsync(
      saveDraftingEngineAvailability(
        instance(mockedProjectService),
        'project01',
        DEFAULT_DRAFTING_ENGINE_AVAILABILITY,
        { availableEngines: [DraftingEngine.Nmt, DraftingEngine.Llm], selectedEngine: DraftingEngine.Llm }
      )
    ).toBeRejected();

    verify(mockedProjectService.onlineSetDraftingEngine(anything(), anything())).never();
  });
});

class TestEnvironment {
  readonly fixture: ComponentFixture<DraftingEngineAvailabilityComponent>;
  readonly component: DraftingEngineAvailabilityComponent;
  readonly emitted: DraftingEngineAvailability[] = [];

  constructor(availability: DraftingEngineAvailability) {
    this.fixture = TestBed.createComponent(DraftingEngineAvailabilityComponent);
    this.component = this.fixture.componentInstance;
    this.component.availability = availability;
    this.component.availabilityChange.subscribe((value: DraftingEngineAvailability) => this.emitted.push(value));
    this.fixture.detectChanges();
  }

  get engineLabels(): string[] {
    const labels: HTMLElement[] = Array.from(this.fixture.nativeElement.querySelectorAll('.engine-label'));
    return labels.map(label => label.textContent?.trim() ?? '');
  }
}
