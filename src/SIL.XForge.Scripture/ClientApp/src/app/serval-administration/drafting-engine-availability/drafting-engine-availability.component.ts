import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatRadioButton, MatRadioGroup } from '@angular/material/radio';
import { TranslocoModule } from '@ngneat/transloco';
import { isEqual } from 'lodash-es';
import { SFProjectService } from '../../core/sf-project.service';
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

/**
 * Saves the parts of `availability` that differ from `previous` to the project. The available engines are saved
 * before the selected engine, because the server only accepts a selected engine that is available.
 *
 * DraftingEngineAvailabilityComponent does not call this itself. It only reports what the admin chose, because the
 * pages that show it save at different times: the Serval project page saves each change straight away, and the
 * onboarding request page saves when the request is approved. Those pages call this, and it lives here so that the
 * way to save the component's value is found beside the component.
 */
export async function saveDraftingEngineAvailability(
  projectService: SFProjectService,
  projectId: string,
  previous: DraftingEngineAvailability,
  availability: DraftingEngineAvailability
): Promise<void> {
  if (!isEqual(previous.availableEngines, availability.availableEngines)) {
    await projectService.onlineSetAvailableDraftingEngines(projectId, availability.availableEngines);
  }
  if (previous.selectedEngine !== availability.selectedEngine) {
    await projectService.onlineSetDraftingEngine(projectId, availability.selectedEngine);
  }
}

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
