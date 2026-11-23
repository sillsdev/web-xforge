import { Component, DestroyRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatIcon } from '@angular/material/icon';
import { MatRadioButton, MatRadioGroup } from '@angular/material/radio';
import { Router } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { DraftConfig } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { ExternalUrlService } from 'xforge-common/external-url.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { filterNullish, quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { SFProjectService } from '../../../../core/sf-project.service';
import { NoticeComponent } from '../../../../shared/notice/notice.component';
import {
  DEFAULT_DRAFTING_ENGINE,
  DraftingEngineAvailability,
  draftingEngineAvailabilityOf,
  SELECTABLE_DRAFTING_ENGINE_INFO,
  SelectableDraftingEngine,
  SelectableDraftingEngineInfo
} from '../drafting-engine';

/** Lets a project member choose which of the project's available engines its drafts are generated with. */
@Component({
  selector: 'app-draft-engine-selection',
  templateUrl: './draft-engine-selection.component.html',
  styleUrl: './draft-engine-selection.component.scss',
  imports: [
    FormsModule,
    MatButton,
    MatCheckbox,
    MatIcon,
    MatRadioGroup,
    MatRadioButton,
    NoticeComponent,
    TranslocoModule
  ]
})
export class DraftEngineSelectionComponent {
  readonly engineInfo: Record<SelectableDraftingEngine, SelectableDraftingEngineInfo> = SELECTABLE_DRAFTING_ENGINE_INFO;
  /** The engines the project's team can choose between. */
  availableEngines: SelectableDraftingEngine[] = [];
  /** The engine chosen on this page, which becomes the project's engine when saved. */
  selectedEngine: SelectableDraftingEngine = DEFAULT_DRAFTING_ENGINE;
  /** Whether the user has ticked the box acknowledging that the selected engine sends text to a third party. */
  hasAcknowledgedDataSharing: boolean = false;
  saving: boolean = false;
  /** Whether the user has tried to save the selected engine. */
  private saveAttempted: boolean = false;

  /** The engine the project uses, as last read from the project. */
  private projectEngine: SelectableDraftingEngine = DEFAULT_DRAFTING_ENGINE;
  private hasLoadedProject: boolean = false;

  constructor(
    private readonly activatedProject: ActivatedProjectService,
    private readonly projectService: SFProjectService,
    private readonly router: Router,
    private readonly onlineStatusService: OnlineStatusService,
    // The "Learn more" link goes to the general page about drafts until a help page about engines exists.
    readonly urlService: ExternalUrlService,
    destroyRef: DestroyRef
  ) {
    this.activatedProject.changes$
      .pipe(filterNullish(), quietTakeUntilDestroyed(destroyRef))
      .subscribe(projectDoc => this.updateFromProject(projectDoc.data?.translateConfig.draftConfig));
  }

  get isOnline(): boolean {
    return this.onlineStatusService.isOnline;
  }

  get selectedEngineUsesLlm(): boolean {
    return this.engineInfo[this.selectedEngine].usesLlm;
  }

  /** An engine that sends text to a third party can only be saved once the user has acknowledged that it does. */
  private get needsAcknowledgement(): boolean {
    return this.selectedEngineUsesLlm && !this.hasAcknowledgedDataSharing;
  }

  /**
   * Whether to tell the user that they have to tick the acknowledgement box. They are told once they have tried to
   * save without it, and until they tick it.
   */
  get showAcknowledgementRequired(): boolean {
    return this.saveAttempted && this.needsAcknowledgement;
  }

  selectEngine(engine: SelectableDraftingEngine): void {
    if (engine === this.selectedEngine) return;
    this.selectedEngine = engine;
    // The acknowledgement is of the engine that was selected when the box was ticked, not of this one.
    this.hasAcknowledgedDataSharing = false;
    this.saveAttempted = false;
  }

  async save(): Promise<void> {
    const projectId: string | undefined = this.activatedProject.projectId;
    // The engine is saved on the server, so saving needs a connection. The save button is disabled while offline.
    if (projectId == null || !this.isOnline || this.saving) return;
    this.saveAttempted = true;
    if (this.needsAcknowledgement) return;
    if (this.selectedEngine !== this.projectEngine) {
      this.saving = true;
      try {
        await this.projectService.onlineSetDraftingEngine(projectId, this.selectedEngine);
      } finally {
        this.saving = false;
      }
    }
    this.navigateToDrafting();
  }

  navigateToDrafting(): void {
    void this.router.navigate(['/projects', this.activatedProject.projectId, 'draft-generation']);
  }

  /**
   * Shows the engines the project now has. The user's choice on this page is kept when the project changes, for
   * example when someone else saves a different engine, unless the chosen engine is no longer available.
   */
  private updateFromProject(draftConfig: DraftConfig | undefined): void {
    const availability: DraftingEngineAvailability = draftingEngineAvailabilityOf(draftConfig);
    this.availableEngines = availability.availableEngines;
    this.projectEngine = availability.selectedEngine;
    if (!this.hasLoadedProject || !this.availableEngines.includes(this.selectedEngine)) {
      this.selectedEngine = this.projectEngine;
      this.hasAcknowledgedDataSharing = false;
      this.saveAttempted = false;
    }
    this.hasLoadedProject = true;
  }
}
