import { CommonModule } from '@angular/common';
import { Component, DestroyRef, EventEmitter } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatRippleModule } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nKeyForComponent, I18nService } from 'xforge-common/i18n.service';
import { ElementState } from 'xforge-common/models/element-state';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { SFUserProjectsService } from 'xforge-common/user-projects.service';
import { quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { XForgeCommonModule } from 'xforge-common/xforge-common.module';
import { hasData, notNull } from '../../../../type-utils';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { ParatextService, SelectableProject, SelectableProjectWithLanguageCode } from '../../../core/paratext.service';
import { SFProjectService } from '../../../core/sf-project.service';
import { DeactivateAllowed } from '../../../shared/project-router.guard';
import { projectLabel } from '../../../shared/utils';
import { isSFProjectSyncing } from '../../../sync/sync.component';
import {
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
    MatFormFieldModule,
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
export class DraftSourcesComponent extends DataLoadingComponent implements DeactivateAllowed {
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

  languageCodeConfirmationMessageIfUserTriesToContinue: I18nKeyForComponent<'draft_sources'> | null = null;
  clearLanguageCodeConfirmationCheckbox = new EventEmitter<void>();
  changesMade = false;
  deactivationPrompt: string = this.i18n.translateStatic('draft_sources.discard_changes_confirmation');

  /** Whether some projects are syncing currently. */
  syncStatus: Map<string, ProjectStatus> = new Map<string, ProjectStatus>();

  /** SF projects and resources that the current user is on at SF. */
  userConnectedProjectsAndResources: SFProjectProfileDoc[] = [];

  private controlStates = new Map<string, ElementState>();

  constructor(
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly destroyRef: DestroyRef,
    private readonly paratextService: ParatextService,
    private readonly dialogService: DialogService,
    private readonly projectService: SFProjectService,
    private readonly userProjectsService: SFUserProjectsService,
    private readonly router: Router,
    private readonly onlineStatus: OnlineStatusService,
    readonly i18n: I18nService,
    noticeService: NoticeService
  ) {
    super(noticeService);

    this.activatedProjectService.changes$.pipe(quietTakeUntilDestroyed(this.destroyRef)).subscribe(projectDoc => {
      if (projectDoc?.data != null) {
        const { trainingSources, trainingTargets, draftingSources } = projectToDraftSources(projectDoc.data);
        if (trainingSources.length > 2) throw new Error('More than 2 training sources is not supported');
        if (draftingSources.length > 1) throw new Error('More than 1 drafting source is not supported');
        if (trainingTargets.length !== 1) throw new Error('Exactly 1 training target is required');

        this.trainingSources = trainingSources.map(translateSourceToSelectableProjectWithLanguageTag);

        this.trainingTargets = trainingTargets;
        this.draftingSources = draftingSources.map(translateSourceToSelectableProjectWithLanguageTag);

        this.nonSelectableProjects = [...this.trainingSources.filter(notNull), ...this.draftingSources.filter(notNull)];

        if (this.draftingSources.length < 1) this.draftingSources.push(undefined);
        if (this.trainingSources.length < 1) this.trainingSources.push(undefined);
      }
    });

    this.userProjectsService.projectDocs$
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe((projects?: SFProjectProfileDoc[]) => {
        if (projects == null) return;
        this.userConnectedProjectsAndResources = projects.filter(project => project.data != null);
      });

    this.loadProjects();
  }

  get appOnline(): boolean {
    return this.onlineStatus.isOnline;
  }

  get loading(): boolean {
    return !this.isLoaded;
  }

  get referenceLanguageDisplayName(): string {
    const uniqueTags = Array.from(new Set(this.trainingSources.filter(notNull).map(p => p.languageTag)));
    const displayNames = uniqueTags.map(tag => this.i18n.getLanguageDisplayName(tag) ?? tag);
    return this.i18n.enumerateList(displayNames);
  }

  get sourceLanguageDisplayName(): string | undefined {
    const definedSources = this.draftingSources.filter(notNull);

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
    return this.i18n.enumerateList(this.draftingSources.filter(notNull).map(s => s.shortName) ?? []);
  }

  get referencesSubtitle(): string {
    return this.i18n.enumerateList(this.trainingSources.filter(notNull).map(r => r.shortName) ?? []);
  }

  get targetSubtitle(): string {
    return this.i18n.enumerateList(this.trainingTargets.filter(notNull).map(t => t.shortName) ?? []);
  }

  parentheses(value?: string): string {
    return value ? `(${value})` : '';
  }

  get targetLanguageTag(): string {
    return this.trainingTargets[0]!.writingSystem.tag;
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
      draftingSources: this.draftingSources.filter(notNull),
      trainingSources: this.trainingSources.filter(notNull),
      trainingTargets: this.trainingTargets
        .filter(notNull)
        .map(t => translateSourceToSelectableProjectWithLanguageTag(t))
    };
  }

  projectPlaceholder(project: SelectableProject | undefined): string {
    return project == null ? '' : projectLabel(project);
  }

  /** Returns all Paratext IDs that should not be selectable as a draft source.
   * @param draftSources The array of draftSources currently selected (specific to training or drafting).
   * @param selectedId The currently selected paratextId that should be visible in the list of sources.
   */
  getHiddenParatextIds(draftSources: ({ paratextId: string } | undefined)[], selectedId?: string): string[] {
    return [...draftSources, ...this.trainingTargets]
      .filter(p => p != null && p.paratextId !== selectedId)
      .map(p => p!.paratextId);
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
      this.clearLanguageCodeConfirmationCheckbox.emit();
    } else {
      array[index] = undefined;
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

  get allowAddingATrainingSource(): boolean {
    return this.trainingSources.length < 2 && this.trainingSources.every(notNull);
  }

  get allProjectsSavedAndSynced(): boolean {
    return (
      this.getControlState('projectSettings') === ElementState.Submitted &&
      Array.from(this.syncStatus.values()).every(entry => entry.isSyncing === false)
    );
  }

  async cancel(): Promise<void> {
    const leavePage =
      !this.changesMade ||
      (await this.dialogService.confirm(
        this.i18n.translate('draft_sources.discard_changes_confirmation'),
        this.i18n.translate('draft_sources.leave_and_discard'),
        this.i18n.translate('draft_sources.stay_on_page')
      ));
    if (leavePage) {
      this.navigateToDrafting();
    }
  }

  promptUserToDeactivate(): boolean {
    return this.changesMade;
  }

  navigateToDrafting(): void {
    this.router.navigate(['/projects', this.activatedProjectService.projectId, 'draft-generation']);
  }

  async save(): Promise<void> {
    const currentProjectDoc: SFProjectProfileDoc | undefined = this.activatedProjectService.projectDoc;
    if (!hasData(currentProjectDoc)) throw new Error('Project doc or data is null');

    const definedSources: SelectableProjectWithLanguageCode[] = this.draftingSources.filter(notNull);
    const definedReferences: SelectableProjectWithLanguageCode[] = this.trainingSources.filter(notNull);

    let messageKey: I18nKeyForComponent<'draft_sources'> | undefined;
    if (definedSources.length === 0 && definedReferences.length === 0) {
      messageKey = 'select_at_least_one_source_and_reference';
    } else if (definedSources.length === 0) messageKey = 'select_at_least_one_source';
    else if (definedReferences.length === 0) messageKey = 'select_at_least_one_reference';
    else if (this.languageCodeConfirmationMessageIfUserTriesToContinue) {
      messageKey = this.languageCodeConfirmationMessageIfUserTriesToContinue;
    }
    if (messageKey) {
      this.dialogService.message(this.i18n.translate(`draft_sources.${messageKey}`));
      return;
    }

    const sourcesSettingsChange: DraftSourcesSettingsChange = sourceArraysToSettingsChange(
      definedReferences,
      definedSources,
      this.trainingTargets,
      currentProjectDoc.data.paratextId
    );
    await this.checkUpdateStatus(
      'projectSettings',
      this.projectService.onlineUpdateSettings(currentProjectDoc.id, sourcesSettingsChange)
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
      throw error;
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
          projectDoc.remoteChanges$.pipe(quietTakeUntilDestroyed(this.destroyRef)).subscribe(() => {
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
  trainingSources: SelectableProject[],
  /** It may not make sense for drafting to have no drafting source. But for specifying project settings, allow an
   * empty setting for drafting source. */
  draftingSources: SelectableProject[],
  trainingTargets: SelectableProject[],
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
