import { CommonModule } from '@angular/common';
import { Component, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatRippleModule } from '@angular/material/core';
import { MatIconModule } from '@angular/material/icon';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
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

  trainingSources: (SelectableProject | undefined)[];
  trainingTargets: (SFProjectProfile | undefined)[];
  draftingSources: (SelectableProject | undefined)[];

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
    return this.activatedProject.projectDoc?.data.shortName ?? '';
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
    private readonly activatedProject: ActivatedProjectService,
    private readonly destroyRef: DestroyRef,
    private readonly paratextService: ParatextService,
    private readonly i18n: I18nService,
    noticeService: NoticeService
  ) {
    super(noticeService);
    this.activatedProject.changes$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      const projectDoc = this.activatedProject.projectDoc;
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

    saveSources({
      trainingSources: this.trainingSources,
      trainingTargets: this.trainingTargets,
      draftingSources: this.draftingSources
    } as DraftSourcesAsArrays);
  }
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
async function saveSources(sources: DraftSourcesAsArrays): Promise<void> {
  console.log(sources);
}
