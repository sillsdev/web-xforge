import { Component, DestroyRef } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { TranslocoModule } from '@ngneat/transloco';
import { TrainingData } from 'realtime-server/lib/esm/scriptureforge/models/training-data';
import { EMPTY, switchMap } from 'rxjs';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { I18nService } from 'xforge-common/i18n.service';
import { quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { SelectableProjectWithLanguageCode } from '../../../core/models/selectable-project';
import { projectLabel } from '../../../shared/utils';
import {
  DraftSourcesAsSelectableProjectArrays,
  draftSourcesAsTranslateSourceArraysToDraftSourcesAsSelectableProjectArrays,
  projectToDraftSources
} from '../draft-utils';
import { TrainingDataService } from '../training-data/training-data.service';

@Component({
  selector: 'app-confirm-sources',
  imports: [TranslocoModule, MatIcon],
  templateUrl: './confirm-sources.component.html',
  styleUrl: './confirm-sources.component.scss'
})
export class ConfirmSourcesComponent {
  draftSources: DraftSourcesAsSelectableProjectArrays = {
    trainingSources: [],
    trainingTargets: [],
    draftingSources: []
  };
  protected trainingDataFiles: TrainingData[] = [];

  constructor(
    private readonly destroyRef: DestroyRef,
    private readonly i18nService: I18nService,
    private readonly activatedProject: ActivatedProjectService,
    private readonly trainingDataService: TrainingDataService
  ) {
    this.activatedProject.changes$.pipe(quietTakeUntilDestroyed(this.destroyRef)).subscribe(projectDoc => {
      if (projectDoc?.data == null) return;
      this.draftSources = draftSourcesAsTranslateSourceArraysToDraftSourcesAsSelectableProjectArrays(
        projectToDraftSources(projectDoc.data)
      );
    });

    this.activatedProject.projectId$
      .pipe(
        quietTakeUntilDestroyed(this.destroyRef),
        switchMap(projectId =>
          projectId == null ? EMPTY : this.trainingDataService.getTrainingData$(projectId, this.destroyRef)
        )
      )
      .subscribe(activeFiles => {
        this.trainingDataFiles = activeFiles;
      });
  }

  projectLabel(project: SelectableProjectWithLanguageCode): string {
    return projectLabel(project);
  }

  get trainingSources(): SelectableProjectWithLanguageCode[] {
    return this.draftSources.trainingSources;
  }

  get trainingTargets(): SelectableProjectWithLanguageCode[] {
    return this.draftSources.trainingTargets;
  }

  get draftingSources(): SelectableProjectWithLanguageCode[] {
    return this.draftSources.draftingSources;
  }

  get referenceLanguage(): string {
    return this.displayNameForProjectsLanguages(this.trainingSources);
  }

  get targetLanguage(): string {
    return this.displayNameForProjectsLanguages(this.trainingTargets);
  }

  get draftingSourceLanguage(): string {
    return this.displayNameForProjectsLanguages(this.draftingSources);
  }

  get draftingSourceShortNames(): string {
    return this.i18nService.enumerateList(this.draftingSources.filter(p => p != null).map(p => p.shortName));
  }

  displayNameForProjectsLanguages(projects: { languageTag?: string }[]): string {
    const uniqueTags = [...new Set(projects.map(p => p.languageTag).filter(t => t != null))];
    const displayNames = uniqueTags.map(tag => this.i18nService.getLanguageDisplayName(tag) ?? tag);
    return this.i18nService.enumerateList(displayNames);
  }
}
