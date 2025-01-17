import { CommonModule } from '@angular/common';
import { Component, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatRippleModule } from '@angular/material/core';
import { MatIconModule } from '@angular/material/icon';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { TranslateSource } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { ActivatedProjectService } from '../../../../xforge-common/activated-project.service';
import { DataLoadingComponent } from '../../../../xforge-common/data-loading-component';
import { I18nService } from '../../../../xforge-common/i18n.service';
import { NoticeService } from '../../../../xforge-common/notice.service';
import { XForgeCommonModule } from '../../../../xforge-common/xforge-common.module';
import { ParatextService, SelectableProject } from '../../../core/paratext.service';
import { DraftSourcesAsArrays, projectToDraftSources } from '../draft-utils';

@Component({
  selector: 'app-draft-sources',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, XForgeCommonModule, MatRippleModule, MatCardModule, CommonModule],
  templateUrl: './draft-sources.component.html',
  styleUrl: './draft-sources.component.scss'
})
export class DraftSourcesComponent extends DataLoadingComponent {
  step = 1;

  trainingSources: [TranslateSource?, TranslateSource?];
  trainingTargets: [SFProjectProfile];
  draftingSources: [TranslateSource?];

  projects?: SelectableProject[];
  resources?: SelectableProject[];

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
    noticeService: NoticeService
  ) {
    super(noticeService);
    this.activatedProjectService.changes$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      const projectDoc = this.activatedProjectService.projectDoc;
      if (projectDoc != null) {
        const sources = projectToDraftSources(projectDoc.data);
        this.trainingSources = sources.trainingSources;
        this.trainingTargets = sources.trainingTargets;
        this.draftingSources = sources.draftingSources;

        if (this.draftingSources.length < 1) this.draftingSources.push(undefined);
        if (this.trainingSources.length < 1) this.trainingSources.push(undefined);
      }
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

  sourceSelected(array: any, index: any, paratextId: any): void {
    const selectedProject =
      this.projects?.find(p => p.paratextId === paratextId) ??
      this.resources?.find(r => r.paratextId === paratextId) ??
      null;

    if (selectedProject != null) {
      array[index] = selectedProject;
    } else {
      array[index] = undefined;
    }
  }

  get allowAddingATrainingSource(): boolean {
    return this.trainingSources.length < 2 && this.trainingSources.every(s => s != null);
  }

  save(): void {
    this.noticeService.showError('Save is not implemented');

    const sources: DraftSourcesAsArrays = {
      trainingSources: this.trainingSources,
      trainingTargets: this.trainingTargets,
      draftingSources: this.draftingSources
    };
    saveSources(sources, this.activatedProjectService);
  }
}

export interface DraftSourcesConfig {
  additionalTrainingSourceEnabled: boolean;
  additionalTrainingSource?: TranslateSource;
  alternateSourceEnabled: boolean;
  alternateSource?: TranslateSource;
  alternateTrainingSourceEnabled: boolean;
  alternateTrainingSource?: TranslateSource;
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
function saveSources(sources: DraftSourcesAsArrays, activatedProjectService: ActivatedProjectService): void {
  const currentProjectParatextId: string = activatedProjectService.projectDoc?.data.paratextId;
  const draftSourcesConfig: DraftSourcesConfig = draftSourceArraysToDraftSourcesConfig(
    sources,
    currentProjectParatextId
  );
  // TODO Save draft sources config to project
}

export function draftSourceArraysToDraftSourcesConfig(
  sources: DraftSourcesAsArrays,
  currentProjectParatextId: string
): DraftSourcesConfig {
  // Extra precaution on array lengths for now in case the type system is being bypassed.
  if (sources.draftingSources.length > 1) {
    throw new Error('Drafting sources array must contain 0 or 1 source');
  }
  if (sources.trainingSources.length > 2) {
    throw new Error('Training sources array must contain 0, 1, or 2 sources');
  }
  if (sources.trainingTargets.length !== 1) {
    throw new Error('Training targets array must contain exactly 1 project');
  }

  const trainingTargetParatextId = sources.trainingTargets[0].paratextId;
  if (currentProjectParatextId !== trainingTargetParatextId) {
    throw new Error('Training target must be the current project');
  }

  const alternateTrainingSource: TranslateSource = sources.trainingSources[0];
  const additionalTrainingSource: TranslateSource = sources.trainingSources[1];
  const alternateSource: TranslateSource = sources.draftingSources[0];

  const config: DraftSourcesConfig = {
    additionalTrainingSourceEnabled: additionalTrainingSource != null,
    additionalTrainingSource: additionalTrainingSource,
    alternateSourceEnabled: alternateSource != null,
    alternateSource: alternateSource,
    alternateTrainingSourceEnabled: alternateTrainingSource != null,
    alternateTrainingSource: alternateTrainingSource
  };
  return config;
}
