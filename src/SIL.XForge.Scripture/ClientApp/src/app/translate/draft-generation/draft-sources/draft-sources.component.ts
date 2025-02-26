import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxChange, MatCheckboxModule } from '@angular/material/checkbox';
import { MatRippleModule } from '@angular/material/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { of } from 'rxjs';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { DialogService } from 'xforge-common/dialog.service';
import { FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { I18nService } from 'xforge-common/i18n.service';
import { ElementState } from 'xforge-common/models/element-state';
import { NoticeService } from 'xforge-common/notice.service';
import { SFUserProjectsService } from 'xforge-common/user-projects.service';
import { XForgeCommonModule } from 'xforge-common/xforge-common.module';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { SFProjectSettings } from '../../../core/models/sf-project-settings';
import { ParatextService, SelectableProject, SelectableProjectWithLanguageCode } from '../../../core/paratext.service';
import { SFProjectService } from '../../../core/sf-project.service';
import { isSFProjectSyncing } from '../../../sync/sync.component';
import {
  countNonEquivalentLanguageCodes,
  DraftSourcesAsSelectableProjectArrays,
  projectToDraftSources,
  translateSourceToSelectableProjectWithLanguageTag
} from '../draft-utils';
import { LanguageCodesConfirmationComponent } from '../language-codes-confirmation/language-codes-confirmation.component';

/** Status for a project, which may or may not be at SF. */
export interface ProjectStatus {
  shortName: string;
  knownToBeOnSF: boolean;
  isSyncing?: boolean;
  lastSyncSuccessful?: boolean;
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
    MatCheckboxModule,
    MatProgressSpinnerModule,
    LanguageCodesConfirmationComponent
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

  trainingSources: (SelectableProjectWithLanguageCode | undefined)[] = [];
  trainingTargets: SFProjectProfile[] = [];
  draftingSources: (SelectableProjectWithLanguageCode | undefined)[] = [];

  projects?: SelectableProject[];
  resources?: SelectableProject[];
  // Projects that can be an already selected value, but not necessarily given as an option in the menu
  nonSelectableProjects: SelectableProject[] = [];

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

  parentheses(value?: string): string {
    return value ? `(${value})` : '';
  }

  get multipleSourceSideLanguages(): boolean {
    return countNonEquivalentLanguageCodes(this.sourceSideLanguageCodes) > 1;
  }

  get sourceSideLanguageCodes(): string[] {
    return Array.from(
      new Set([...this.draftingSources, ...this.trainingSources].filter(s => s != null).map(s => s.languageTag))
    );
  }

  get showSourceAndTargetLanguagesIdenticalWarning(): boolean {
    // Show the warning when there's only one language on the source side, but that one language is equivalent to the
    // target language.
    const sourceCodes = this.sourceSideLanguageCodes;
    return (
      sourceCodes.length > 0 &&
      countNonEquivalentLanguageCodes(sourceCodes) === 1 &&
      countNonEquivalentLanguageCodes([sourceCodes[0], this.targetLanguageTag]) < 2
    );
  }

  get targetLanguageTag(): string {
    return this.trainingTargets[0]!.writingSystem.tag;
  }

  constructor(
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly destroyRef: DestroyRef,
    private readonly paratextService: ParatextService,
    private readonly dialogService: DialogService,
    private readonly projectService: SFProjectService,
    private readonly userProjectsService: SFUserProjectsService,
    private readonly router: Router,
    private readonly featureFlags: FeatureFlagService,
    readonly i18n: I18nService,
    noticeService: NoticeService
  ) {
    super(noticeService);

    this.activatedProjectService.changes$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(projectDoc => {
      if (projectDoc?.data != null) {
        const { trainingSources, trainingTargets, draftingSources } = projectToDraftSources(projectDoc.data);
        if (trainingSources.length > 2) throw new Error('More than 2 training sources is not supported');
        if (draftingSources.length > 1) throw new Error('More than 1 drafting source is not supported');
        if (trainingTargets.length !== 1) throw new Error('Exactly 1 training target is required');

        this.trainingSources = trainingSources.map(translateSourceToSelectableProjectWithLanguageTag);

        this.trainingTargets = trainingTargets;
        this.draftingSources = draftingSources.map(translateSourceToSelectableProjectWithLanguageTag);

        this.nonSelectableProjects = [
          ...this.trainingSources.filter(s => s != null),
          ...this.draftingSources.filter(s => s != null)
        ];

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

  get draftSourcesAsArray(): DraftSourcesAsSelectableProjectArrays {
    return {
      draftingSources: this.draftingSources.filter(s => s != null),
      trainingSources: this.trainingSources.filter(s => s != null),
      trainingTargets: this.trainingTargets
        .filter(s => s != null)
        .map(t => translateSourceToSelectableProjectWithLanguageTag(t))
    };
  }

  projectPlaceholder(project: SelectableProject | undefined): string {
    return project == null ? '' : `${project.shortName} - ${project.name}`;
  }

  sourceSelected(
    array: (SelectableProject | SFProjectProfile | undefined)[],
    index: number,
    paratextId: string | undefined
  ): void {
    // When still loading projects, the project selectors will temporarily set the value to null
    if (!this.isLoaded) return;

    const selectedProject: SelectableProject | null =
      this.projects?.find(p => p.paratextId === paratextId) ??
      this.resources?.find(r => r.paratextId === paratextId) ??
      this.nonSelectableProjects.find(p => p.paratextId === paratextId) ??
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
        const nullIndex = array.findIndex(s => s == null);
        array.splice(nullIndex, 1);
      }
    }
  }

  goToStep(step: number): void {
    this.step = step;
    // Remove any undefined values from the arrays, while keeping the length at least 1
    const arrays = [this.trainingSources, this.trainingTargets, this.draftingSources];
    for (const array of arrays) {
      while (array.length > 1 && array.some(s => s == null)) {
        const nullIndex = array.findIndex(s => s == null);
        array.splice(nullIndex, 1);
      }
    }
  }

  confirmationChanged(event: MatCheckboxChange): void {
    this.languageCodesConfirmed = event.checked;
  }

  get allowAddingATrainingSource(): boolean {
    return (
      this.featureFlags.allowAdditionalTrainingSource.enabled &&
      this.trainingSources.length < 2 &&
      this.trainingSources.every(s => s != null)
    );
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
      this.navigateToDrafting();
    }
  }

  navigateToDrafting(): void {
    this.router.navigate(['/projects', this.activatedProjectService.projectId, 'draft-generation']);
  }

  get allProjectsSavedAndSynced(): boolean {
    return (
      this.getControlState('projectSettings') === ElementState.Submitted &&
      Array.from(this.syncStatus.values()).every(entry => entry.isSyncing === false)
    );
  }

  async save(): Promise<void> {
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

    if (this.activatedProjectService.projectDoc == null) throw new Error('Project doc is null');
    if (this.activatedProjectService.projectDoc.data == null) throw new Error('Project doc data is null');
    const currentProjectParatextId: string = this.activatedProjectService.projectDoc.data.paratextId;
    const sourcesSettingsChange: DraftSourcesSettingsChange = sourceArraysToSettingsChange(
      this.trainingSources as [SelectableProject, SelectableProject?],
      this.draftingSources as [SelectableProject?],
      this.trainingTargets as [SFProjectProfile],
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
    } catch (error) {
      console.error('Error updating project settings', error);
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
      const projectDoc: SFProjectProfileDoc | undefined = this.userConnectedProjectsAndResources.find(
        p => p.data?.paratextId === givenProject.paratextId
      );
      if (projectDoc == null || projectDoc.data == null) {
        // If the user isn't on the project yet, it may still be being created. Tho when we don't show the sync status
        // until the project setting is saved, this might not ever be used.

        const status: ProjectStatus = { shortName: givenProject.shortName, knownToBeOnSF: false };
        this.syncStatus.set(givenProject.paratextId, status);
      } else {
        const projectStatus: ProjectStatus | undefined = this.syncStatus.get(projectDoc.data.paratextId);
        if (projectStatus == null || projectStatus.knownToBeOnSF === false) {
          const updateSyncStatusForProject = (projectDoc: SFProjectProfileDoc): void => {
            if (projectDoc.data == null) throw new Error('Project doc data is null');
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
  if (trainingTargets.length !== 1 || trainingTargets[0] == null) {
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
