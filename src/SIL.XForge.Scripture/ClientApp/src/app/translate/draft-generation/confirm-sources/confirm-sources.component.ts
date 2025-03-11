import { Component, DestroyRef, EventEmitter, Output } from '@angular/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule } from '@ngneat/transloco';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { I18nService } from 'xforge-common/i18n.service';
import { quietTakeUntilDestroyed } from 'xforge-common/utils';
import { SelectableProjectWithLanguageCode } from '../../../core/paratext.service';
import {
  DraftSourcesAsSelectableProjectArrays,
  draftSourcesAsTranslateSourceArraysToDraftSourcesAsSelectableProjectArrays,
  projectToDraftSources
} from '../draft-utils';
import { LanguageCodesConfirmationComponent } from '../language-codes-confirmation/language-codes-confirmation.component';

@Component({
  selector: 'app-confirm-sources',
  standalone: true,
  imports: [TranslocoModule, MatCheckboxModule, MatIconModule, LanguageCodesConfirmationComponent],
  templateUrl: './confirm-sources.component.html',
  styleUrl: './confirm-sources.component.scss'
})
export class ConfirmSourcesComponent {
  @Output() languageCodesVerified = new EventEmitter<boolean>(false);

  draftSources: DraftSourcesAsSelectableProjectArrays = {
    trainingSources: [],
    trainingTargets: [],
    draftingSources: []
  };

  constructor(
    private readonly destroyRef: DestroyRef,
    private readonly i18nService: I18nService,
    private readonly activatedProject: ActivatedProjectService
  ) {
    this.activatedProject.projectDoc$.pipe(quietTakeUntilDestroyed(this.destroyRef)).subscribe(projectDoc => {
      if (projectDoc?.data != null) {
        this.draftSources = draftSourcesAsTranslateSourceArraysToDraftSourcesAsSelectableProjectArrays(
          projectToDraftSources(projectDoc?.data)
        );
      }
    });
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

  confirmationChanged(checked: boolean): void {
    this.languageCodesVerified.emit(checked);
  }

  displayNameForProjectsLanguages(projects: { languageTag: string }[]): string {
    const uniqueTags = Array.from(new Set(projects.filter(p => p != null).map(p => p.languageTag)));
    const displayNames = uniqueTags.map(tag => this.i18nService.getLanguageDisplayName(tag) ?? tag);
    return this.i18nService.enumerateList(displayNames);
  }
}
