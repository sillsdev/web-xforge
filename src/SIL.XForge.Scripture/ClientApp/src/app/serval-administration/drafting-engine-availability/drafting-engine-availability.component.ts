import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatRadioButton, MatRadioGroup } from '@angular/material/radio';
import { TranslocoModule } from '@ngneat/transloco';
import {
  DEFAULT_DRAFTING_ENGINE,
  DEFAULT_DRAFTING_ENGINE_AVAILABILITY,
  DraftingEngineAvailability,
  resolveDraftingEngines,
  SELECTABLE_DRAFTING_ENGINE_INFO,
  SELECTABLE_DRAFTING_ENGINES,
  SelectableDraftingEngine,
  SelectableDraftingEngineInfo
} from '../../translate/draft-generation/drafting-engine/drafting-engine';

/** Lets a Serval admin choose which drafting engines a project may use, and which one it uses. */
@Component({
  selector: 'app-drafting-engine-availability',
  templateUrl: './drafting-engine-availability.component.html',
  styleUrl: './drafting-engine-availability.component.scss',
  imports: [MatCheckbox, MatRadioGroup, MatRadioButton, TranslocoModule]
})
export class DraftingEngineAvailabilityComponent {
  @Input() availability: DraftingEngineAvailability = DEFAULT_DRAFTING_ENGINE_AVAILABILITY;
  @Input() disabled: boolean = false;
  @Output() availabilityChange = new EventEmitter<DraftingEngineAvailability>();

  readonly engines: readonly SelectableDraftingEngine[] = SELECTABLE_DRAFTING_ENGINES;
  readonly engineInfo: Record<SelectableDraftingEngine, SelectableDraftingEngineInfo> = SELECTABLE_DRAFTING_ENGINE_INFO;

  isAvailable(engine: SelectableDraftingEngine): boolean {
    return this.availability.availableEngines.includes(engine);
  }

  /** The default engine is available to every project, so it cannot be made unavailable. */
  isAlwaysAvailable(engine: SelectableDraftingEngine): boolean {
    return engine === DEFAULT_DRAFTING_ENGINE;
  }

  onAvailableChange(engine: SelectableDraftingEngine, available: boolean): void {
    if (this.isAlwaysAvailable(engine)) return;
    const availableEngines: SelectableDraftingEngine[] = available
      ? [...this.availability.availableEngines, engine]
      : this.availability.availableEngines.filter(e => e !== engine);
    // A project always has a selected engine, so when the selected one is made unavailable the default takes its place.
    this.update(resolveDraftingEngines(availableEngines, this.availability.selectedEngine));
  }

  onSelectedChange(selectedEngine: SelectableDraftingEngine): void {
    this.update({ availableEngines: this.availability.availableEngines, selectedEngine: selectedEngine });
  }

  private update(availability: DraftingEngineAvailability): void {
    this.availability = availability;
    this.availabilityChange.emit(availability);
  }
}
