import { CommonModule } from '@angular/common';
import { Component, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxChange, MatCheckboxModule } from '@angular/material/checkbox';
import { MatRippleModule } from '@angular/material/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule } from '@ngneat/transloco';
import { TranslateSource } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { of } from 'rxjs';
import { ActivatedProjectService } from '../../../../xforge-common/activated-project.service';
import { DataLoadingComponent } from '../../../../xforge-common/data-loading-component';
import { DialogService } from '../../../../xforge-common/dialog.service';
import { I18nService } from '../../../../xforge-common/i18n.service';
import { ElementState } from '../../../../xforge-common/models/element-state';
import { NoticeService } from '../../../../xforge-common/notice.service';
import { XForgeCommonModule } from '../../../../xforge-common/xforge-common.module';
import { SFProjectSettings } from '../../../core/models/sf-project-settings';
import { ParatextService, SelectableProject } from '../../../core/paratext.service';
import { SFProjectService } from '../../../core/sf-project.service';
import { NoticeComponent } from '../../../shared/notice/notice.component';
import { DraftSource, DraftSourcesService } from '../draft-sources.service';

/** Enables user to configure settings for drafting. */
@Component({
  selector: 'app-draft-sources',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    XForgeCommonModule,
    MatRippleModule,
    MatCardModule,
    CommonModule,
    TranslocoModule,
    NoticeComponent,
    MatCheckboxModule
  ],
  templateUrl: './draft-sources.component.html',
  styleUrl: './draft-sources.component.scss'
})
export class DraftSourcesComponent extends DataLoadingComponent {
  static readonly projectSettingValueUnset = 'unset';

  step = 1;

  trainingSources: [SelectableProject?, SelectableProject?] = [];
  // TODO Consider whether trainingTargets needs to be type SFProjectProfile.
  trainingTargets: [DraftSource];
  draftingSources: [SelectableProject?] = [];

  projects?: SelectableProject[];
  resources?: SelectableProject[];

  languageCodesConfirmed = false;
  changesMade = false;

  private controlStates = new Map<string, ElementState>();

  get loading(): boolean {
    return !this.isLoaded;
  }

  get sourceLanguageDisplayName(): string {
    const definedSources = this.draftingSources.filter(s => s != null);

    if (definedSources.length > 1) throw new Error('Multiple drafting sources not supported');

    if (definedSources.length === 0) return '';

    const singleSource = definedSources[0];

    if (singleSource != null && 'writingSystem' in singleSource) {
      return this.i18n.getLanguageDisplayName((singleSource as any).writingSystem.tag);
    } else {
      // FIXME How can we get the language before the project/resource is synced?
      return '[source language not yet known]';
    }
  }

  get targetLanguageDisplayName(): string {
    if (this.trainingTargets.length !== 1) throw new Error('Multiple training targets not supported');

    return this.i18n.getLanguageDisplayName(this.trainingTargets[0].writingSystem.tag);
  }

  get currentProjectShortName(): string {
    return this.activatedProjectService.projectDoc?.data.shortName ?? '';
  }

  get sourceSubtitle(): string {
    return this.i18n.enumerateList(this.draftingSources.filter(s => s != null).map(s => s.shortName) ?? []);
  }

  get referencesSubtitle(): string {
    return this.i18n.enumerateList(this.trainingSources.filter(s => s != null).map(r => r.shortName) ?? []);
  }

  get targetSubtitle(): string {
    return this.i18n.enumerateList(this.trainingTargets.filter(s => s != null).map(t => t.shortName) ?? []);
  }

  constructor(
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly destroyRef: DestroyRef,
    private readonly paratextService: ParatextService,
    private readonly i18n: I18nService,
    private readonly draftSourcesService: DraftSourcesService,
    private readonly dialogService: DialogService,
    private readonly projectService: SFProjectService,
    noticeService: NoticeService
  ) {
    super(noticeService);

    this.draftSourcesService
      .getDraftProjectSources()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(sources => {
        this.trainingSources = sources.trainingSources;
        this.trainingTargets = sources.trainingTargets;
        this.draftingSources = sources.draftingSources;

        if (this.draftingSources.length < 1) this.draftingSources.push(undefined);
        if (this.trainingSources.length < 1) this.trainingSources.push(undefined);
      });

    this.loadProjects();
  }

  async loadProjects(): Promise<void> {
    this.loadingStarted();
    [this.projects, this.resources] = await Promise.all([
      this.paratextService.getProjects(),
      this.paratextService.getResources()
    ]);
    this.loadingFinished();
  }

  projectPlaceholder(project: SelectableProject | undefined): string {
    return project == null ? '' : `${project.shortName} - ${project.name}`;
  }

  sourceSelected(array: any, index: any, paratextId: string | undefined): void {
    const selectedProject: SelectableProject | undefined =
      this.projects?.find(p => p.paratextId === paratextId) ??
      this.resources?.find(r => r.paratextId === paratextId) ??
      null;

    // The project select component will "select" the project we programmatically set, so prevent mistakenly indicating
    // that the user made a change
    if (selectedProject?.paratextId === array[index]?.paratextId) return;

    this.changesMade = true;

    if (selectedProject != null) {
      array[index] = selectedProject;
      this.languageCodesConfirmed = false;
    } else {
      array[index] = undefined;
    }
  }

  confirmationChanged(event: MatCheckboxChange): void {
    this.languageCodesConfirmed = event.checked;
  }

  get allowAddingATrainingSource(): boolean {
    return this.trainingSources.length < 2 && this.trainingSources.every(s => s != null);
  }

  async cancel(): Promise<void> {
    const leavePage =
      !this.changesMade ||
      (await this.dialogService.confirm(
        of('Are you sure you want leave the page with unsaved changes?'),
        of('Leave & discard changes'),
        of('Stay on page')
      ));
    if (leavePage) {
      this.dialogService.message(of('Not implemented.'));
    }
  }

  async save(): Promise<void> {
    if (!this.languageCodesConfirmed) {
      this.dialogService.message(of('Please confirm that the language codes are correct before saving.'));
      return;
    }

    const currentProjectParatextId: string = this.activatedProjectService.projectDoc?.data.paratextId;
    const sourcesSettingsChange: DraftSourcesSettingsChange = sourceArraysToSettingsChange(
      this.trainingSources,
      this.draftingSources,
      this.trainingTargets,
      currentProjectParatextId
    );
    const projectSettingsChange: SFProjectSettings = sourcesSettingsChange;
    const currentSFProjectId = this.activatedProjectService.projectId;
    if (currentSFProjectId == null) throw new Error('Project ID is null');
    await this.checkUpdateStatus(
      'projectSettings',
      this.projectService.onlineUpdateSettings(currentSFProjectId, projectSettingsChange)
    );
    // TODO Reveal when syncing is complete.
  }

  private async checkUpdateStatus(setting: string, updatePromise: Promise<void>): Promise<void> {
    this.controlStates.set(setting, ElementState.Submitting);
    try {
      await updatePromise;
      this.controlStates.set(setting, ElementState.Submitted);
    } catch (_error) {
      this.controlStates.set(setting, ElementState.Error);
    }
  }

  getControlState(setting: string): ElementState | undefined {
    return this.controlStates.get(setting);
  }
}

export interface DraftSourcesSettingsChange {
  additionalTrainingSourceEnabled: boolean;
  additionalTrainingSourceParatextId?: string;
  alternateSourceEnabled: boolean;
  alternateSourceParatextId?: string;
  alternateTrainingSourceEnabled: boolean;
  alternateTrainingSourceParatextId?: string;
}

/**
 * This is deliberately a function outside of the class to make it easier to make changes without merge conflicts
 *
 * Requirements:
 * - Do not touch the project source (only the "alternate" sources)
 * - Save the draft config to the project
 * - Sync the projects/resources (I think this is implicitly when setting sources)
 * - Inform the user which projects are syncing, and when they are done (this can be a very rough UI)
 *
 * This method is kind of doing the opposite of projectToDraftSources, as it maps the data model back the other way
 */
function saveSources(): void {}

export function sourceArraysToSettingsChange(
  trainingSources: [SelectableProject?, SelectableProject?],
  /** It may not make sense for drafting to have no drafting source. But for specifying project settings, allow an
   * empty setting for drafting source. */
  draftingSources: [SelectableProject?],
  trainingTargets: [SelectableProject],
  currentProjectParatextId: string
): DraftSourcesSettingsChange {
  // Extra precaution on array lengths for now in case the type system is being bypassed.
  if (draftingSources.length > 1) {
    throw new Error('Drafting sources array must contain 0 or 1 source');
  }
  if (trainingSources.length > 2) {
    throw new Error('Training sources array must contain 0, 1, or 2 sources');
  }
  if (trainingTargets.length !== 1) {
    throw new Error('Training targets array must contain exactly 1 project');
  }

  const trainingTargetParatextId = trainingTargets[0].paratextId;
  if (currentProjectParatextId !== trainingTargetParatextId) {
    throw new Error('Training target must be the current project');
  }

  const alternateTrainingSource: SelectableProject | undefined = trainingSources[0];
  const additionalTrainingSource: SelectableProject | undefined = trainingSources[1];
  const alternateSource: SelectableProject | undefined = draftingSources[0];

  const alternateTrainingEnabled = alternateTrainingSource != null;
  const additionalTrainingEnabled = additionalTrainingSource != null;
  const alternateSourceEnabled = alternateSource != null;

  const config: DraftSourcesSettingsChange = {
    additionalTrainingSourceEnabled: additionalTrainingEnabled,
    additionalTrainingSourceParatextId: additionalTrainingEnabled
      ? additionalTrainingSource?.paratextId
      : DraftSourcesComponent.projectSettingValueUnset,
    alternateSourceEnabled: alternateSourceEnabled,
    alternateSourceParatextId: alternateSourceEnabled
      ? alternateSource?.paratextId
      : DraftSourcesComponent.projectSettingValueUnset,
    alternateTrainingSourceEnabled: alternateTrainingEnabled,
    alternateTrainingSourceParatextId: alternateTrainingEnabled
      ? alternateTrainingSource?.paratextId
      : DraftSourcesComponent.projectSettingValueUnset
  };
  return config;
}

function selectableProjectToTranslateSource(project: SelectableProject): TranslateSource {
  return {
    paratextId: project.paratextId,
    projectRef: 'unknown',
    name: 'unknown',
    shortName: project.shortName,
    writingSystem: { tag: 'unknown' }
  };
}
