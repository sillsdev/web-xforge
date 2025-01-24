import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxChange, MatCheckboxModule } from '@angular/material/checkbox';
import { MatRippleModule } from '@angular/material/core';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { TranslateSource } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { of } from 'rxjs';
import { ActivatedProjectService } from '../../../../xforge-common/activated-project.service';
import { DataLoadingComponent } from '../../../../xforge-common/data-loading-component';
import { DialogService } from '../../../../xforge-common/dialog.service';
import { I18nService } from '../../../../xforge-common/i18n.service';
import { ElementState } from '../../../../xforge-common/models/element-state';
import { NoticeService } from '../../../../xforge-common/notice.service';
import { SFUserProjectsService } from '../../../../xforge-common/user-projects.service';
import { XForgeCommonModule } from '../../../../xforge-common/xforge-common.module';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { SFProjectSettings } from '../../../core/models/sf-project-settings';
import { ParatextService, SelectableProject, SelectableProjectWithLanguageCode } from '../../../core/paratext.service';
import { SFProjectService } from '../../../core/sf-project.service';
import { NoticeComponent } from '../../../shared/notice/notice.component';
import { isSFProjectSyncing } from '../../../sync/sync.component';

function translateSourceToSelectableProjectWithLanguageTag(
  project: TranslateSource
): SelectableProjectWithLanguageCode {
  return {
    paratextId: project.paratextId,
    name: project.name,
    shortName: project.shortName,
    languageTag: project.writingSystem.tag
  };
}

/** Status for a project, which may or may not be at SF. */
export interface ProjectStatus {
  shortName: string;
  knownToBeOnSF: boolean;
  isSyncing?: boolean;
  lastSyncSuccessful?: boolean;
}

export interface DraftSourcesAsArrays {
  trainingSources: [TranslateSource?, TranslateSource?];
  trainingTargets: [SFProjectProfile];
  draftingSources: [TranslateSource?];
}
/**
 * Takes a SFProjectProfile and returns the training and drafting sources for the project as three arrays.
 *
 * This considers properties such as alternateTrainingSourceEnabled and alternateTrainingSource and makes sure to only
 * include a source if it's enabled and not null. It also considers whether the project source is implicitly the
 * training and/or drafting source.
 *
 * This method is also intended to be act as an abstraction layer to allow changing the data model in the future without
 * needing to change all the places that use this method.
 *
 * Currently this method provides guarantees via the type system that there will be at most 2 training sources, exactly
 * 1 training target, and at most 1 drafting source. Consumers of this method that cannot accept an arbitrary length for
 * each of these arrays are encouraged to write there code in such a way that it will noticeably break (preferably at
 * build time) if these guarantees are changed, to make it easier to find code that relies on the current limit on the
 * number of sources in each category.
 * @param project The project to get the sources for
 * @returns An object with three arrays: trainingSources, trainingTargets, and draftingSources
 */
export function projectToDraftSources(project: SFProjectProfile): DraftSourcesAsArrays {
  const trainingSources: [TranslateSource?, TranslateSource?] = [];
  const draftingSources: [TranslateSource?] = [];
  const trainingTargets: [SFProjectProfile] = [project];
  const draftConfig = project.translateConfig.draftConfig;
  let trainingSource: TranslateSource | undefined;
  if (draftConfig.alternateTrainingSourceEnabled && draftConfig.alternateTrainingSource != null) {
    trainingSource = draftConfig.alternateTrainingSource;
  } else {
    trainingSource = project.translateConfig.source;
  }
  if (trainingSource != null) {
    trainingSources.push(trainingSource);
  }
  if (draftConfig.additionalTrainingSourceEnabled && draftConfig.additionalTrainingSource != null) {
    trainingSources.push(draftConfig.additionalTrainingSource);
  }
  let draftingSource: TranslateSource | undefined;
  if (draftConfig.alternateSourceEnabled && draftConfig.alternateSource != null) {
    draftingSource = draftConfig.alternateSource;
  } else {
    draftingSource = project.translateConfig.source;
  }
  if (draftingSource != null) {
    draftingSources.push(draftingSource);
  }
  return { trainingSources, trainingTargets, draftingSources };
}

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
export class DraftSourcesComponent extends DataLoadingComponent implements OnInit {
  /** Indicator that a project setting change is for clearing a value. */
  static readonly projectSettingValueUnset = 'unset';

  // Expose ElementState enum to template.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  ElementState = ElementState;

  step = 1;

  trainingSources: [SelectableProjectWithLanguageCode?, SelectableProjectWithLanguageCode?] = [];
  trainingTargets: [SFProjectProfile?] = [];
  draftingSources: [SelectableProjectWithLanguageCode?] = [];

  projects?: SelectableProject[];
  resources?: SelectableProject[];

  languageCodesConfirmed = false;
  changesMade = false;

  /** Whether some projects are syncing currently. */
  syncStatus: Map<string, ProjectStatus> = new Map<string, ProjectStatus>();

  /** SF projects and resources that the current user is on at SF. */
  userConnectedProjectsAndResources: SFProjectProfileDoc[] = [];

  private controlStates = new Map<string, ElementState>();

  get loading(): boolean {
    return !this.isLoaded;
  }

  get referenceLanguageDisplayName(): string {
    const uniqueTags = Array.from(new Set(this.trainingSources.filter(s => s != null).map(p => p.languageTag)));
    const displayNames = uniqueTags.map(tag => this.i18n.getLanguageDisplayName(tag) ?? tag);
    return this.i18n.enumerateList(displayNames);
  }

  get sourceLanguageDisplayName(): string | undefined {
    const definedSources = this.draftingSources.filter(s => s != null);

    if (definedSources.length > 1) throw new Error('Multiple drafting sources not supported');
    else if (definedSources.length < 1) return undefined;
    else return this.i18n.getLanguageDisplayName(definedSources[0].languageTag);
  }

  get targetLanguageDisplayName(): string | undefined {
    if (this.trainingTargets.length !== 1) throw new Error('Multiple training targets not supported');

    return this.i18n.getLanguageDisplayName(this.trainingTargets[0]!.writingSystem.tag);
  }

  get currentProjectShortName(): string {
    return this.activatedProjectService.projectDoc?.data?.shortName ?? '';
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

  parentheses(value: string | null): string {
    return value ? `(${value})` : '';
  }

  get sourceSideLanguageCodes(): string[] {
    return Array.from(
      // FIXME Handle language codes that may be equivalent by not identical strings
      new Set([...this.draftingSources, ...this.trainingSources].filter(s => s != null).map(s => s.languageTag))
    );
  }

  get showSourceAndTargetLanguagesIdenticalWarning(): boolean {
    const sourceCodes = this.sourceSideLanguageCodes;
    // FIXME Handle language codes that may be equivalent by not identical strings
    return sourceCodes.length === 1 && sourceCodes[0] === this.trainingTargets[0]!.writingSystem.tag;
  }

  constructor(
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly destroyRef: DestroyRef,
    private readonly paratextService: ParatextService,
    private readonly dialogService: DialogService,
    private readonly projectService: SFProjectService,
    private readonly userProjectsService: SFUserProjectsService,
    private readonly router: Router,
    readonly i18n: I18nService,
    noticeService: NoticeService
  ) {
    super(noticeService);

    this.activatedProjectService.changes$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(projectDoc => {
      if (projectDoc?.data != null) {
        const { trainingSources, trainingTargets, draftingSources } = projectToDraftSources(projectDoc.data);
        if (trainingSources.length > 2) throw new Error('More than 2 training sources is not supported');

        const mappedTrainingSources: SelectableProjectWithLanguageCode[] = trainingSources
          // FIXME No actual nullish elements, but TS doesn't know because of how we set the array length
          .filter(s => s != null)
          .map(translateSourceToSelectableProjectWithLanguageTag);
        this.trainingSources = [mappedTrainingSources[0], mappedTrainingSources[1]];
        this.trainingTargets = trainingTargets;
        const mappedDraftingSources: SelectableProjectWithLanguageCode[] = draftingSources
          // FIXME No actual nullish elements, but TS doesn't know because of how we set the array length
          .filter(s => s != null)
          .map(translateSourceToSelectableProjectWithLanguageTag);
        this.draftingSources = [mappedDraftingSources[0]];

        if (this.draftingSources.length < 1) this.draftingSources.push(undefined);
        if (this.trainingSources.length < 1) this.trainingSources.push(undefined);
      }
    });

    this.loadProjects();
  }

  async ngOnInit(): Promise<void> {
    this.subscribe(this.userProjectsService.projectDocs$, (projects?: SFProjectProfileDoc[]) => {
      if (projects == null) return;
      this.userConnectedProjectsAndResources = projects.filter(project => project.data != null);
    });
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

  sourceSelected(
    array: (SelectableProject | SFProjectProfile | undefined)[],
    index: number,
    paratextId: string | undefined
  ): void {
    const selectedProject: SelectableProject | null =
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
      // When the user clears a project select, if there are now multiple blank project selects, remove the first one
      if (array.filter(s => s == null).length > 1) {
        const index = array.findIndex(s => s == null);
        array.splice(index, 1);
      }
    }
  }

  goToStep(step: number): void {
    this.step = step;
    // Remove any undefined values from the arrays, while keeping the length at least 1
    const arrays = [this.trainingSources, this.trainingTargets, this.draftingSources];
    for (const array of arrays) {
      while (array.length > 1 && array.some(s => s == null)) {
        const index = array.findIndex(s => s == null);
        array.splice(index, 1);
      }
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
      this.router.navigate(['/projects', this.activatedProjectService.projectId, 'draft-generation']);
    }
  }

  async save(): Promise<void> {
    // TODO verify at least one source and one reference is selected
    const definedSources = this.draftingSources.filter(s => s != null);
    const definedReferences = this.trainingSources.filter(s => s != null);

    let message: string | undefined;
    if (definedSources.length === 0 && definedReferences.length === 0)
      message = 'Please select at least one source and one reference project before saving.';
    else if (definedSources.length === 0) message = 'Please select at least one source project before saving.';
    else if (definedReferences.length === 0) message = 'Please select at least one reference project before saving.';
    else if (!this.languageCodesConfirmed)
      message = 'Please confirm that the language codes are correct before saving.';

    if (message) {
      this.dialogService.message(of(message));
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
    this.monitorSyncStatus();
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

  private monitorSyncStatus(): void {
    this.syncStatus.clear();
    const chosenProjects: SelectableProject[] = [
      ...this.trainingSources.filter(source => source != null),
      ...this.trainingTargets.filter(target => target != null),
      ...this.draftingSources.filter(source => source != null)
    ];

    for (const givenProject of chosenProjects) {
      const projectDoc: SFProjectProfileDoc = this.userConnectedProjectsAndResources.find(
        p => p.data?.paratextId === givenProject.paratextId
      );
      if (projectDoc == null) {
        // If the user isn't on the project yet, it may still be being created. Tho when we don't show the sync status
        // until the project setting is saved, this might not ever be used.

        const status: ProjectStatus = { shortName: givenProject.shortName, knownToBeOnSF: false };
        this.syncStatus.set(givenProject.paratextId, status);
      } else {
        if (
          !this.syncStatus.has(projectDoc.data.paratextId) ||
          this.syncStatus.get(givenProject.paratextId).knownToBeOnSF === false
        ) {
          const updateSyncStatusForProject = (projectDoc: SFProjectProfileDoc): void => {
            const status: ProjectStatus = {
              shortName: projectDoc.data.shortName,
              knownToBeOnSF: true,
              isSyncing: isSFProjectSyncing(projectDoc.data),
              lastSyncSuccessful: projectDoc.data.sync.lastSyncSuccessful === true
            };
            this.syncStatus.set(projectDoc.data.paratextId, status);
          };

          updateSyncStatusForProject(projectDoc);
          projectDoc.remoteChanges$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
            updateSyncStatusForProject(projectDoc);
          });
        }
      }
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

/** Convert some arrays of drafting sources to a settings object that can be applied to a SF project. */
export function sourceArraysToSettingsChange(
  trainingSources: [SelectableProject?, SelectableProject?],
  /** It may not make sense for drafting to have no drafting source. But for specifying project settings, allow an
   * empty setting for drafting source. */
  draftingSources: [SelectableProject?],
  trainingTargets: [SelectableProject?],
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
