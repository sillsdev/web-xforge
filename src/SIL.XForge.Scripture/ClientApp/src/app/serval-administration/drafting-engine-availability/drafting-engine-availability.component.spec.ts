import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DraftingEngine } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { configureTestingModule, getTestTranslocoModule } from 'xforge-common/test-utils';
import { DraftingEngineAvailability } from '../../translate/draft-generation/drafting-engine/drafting-engine';
import { DraftingEngineAvailabilityComponent } from './drafting-engine-availability.component';

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

/** Provides helpers for constructing test data for DraftingEngineAvailabilityComponent tests. */
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
