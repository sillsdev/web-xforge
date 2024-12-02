import { Component, EventEmitter, Output } from '@angular/core';
import { MatCheckboxChange, MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule } from '@ngneat/transloco';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { TranslateSource } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { I18nService } from 'xforge-common/i18n.service';
import { NoticeComponent } from '../../../shared/notice/notice.component';

@Component({
  selector: 'app-confirm-sources',
  standalone: true,
  imports: [TranslocoModule, NoticeComponent, MatCheckboxModule, MatIconModule],
  templateUrl: './confirm-sources.component.html',
  styleUrl: './confirm-sources.component.scss'
})
export class ConfirmSourcesComponent {
  @Output() languageCodesVerified = new EventEmitter<boolean>(false);

  trainingSources: TranslateSource[] = [];
  trainingTargets: SFProjectProfile[] = [];
  draftingSources: TranslateSource[] = [];

  constructor(
    private readonly i18nService: I18nService,
    activatedProjectService: ActivatedProjectService
  ) {
    const project = activatedProjectService.projectDoc!.data!;
    this.trainingTargets.push(project);

    const draftConfig = project.translateConfig.draftConfig;

    let trainingSource: TranslateSource | undefined;
    if (draftConfig.alternateTrainingSourceEnabled && draftConfig.alternateTrainingSource != null) {
      trainingSource = draftConfig.alternateTrainingSource;
    } else {
      trainingSource = project.translateConfig.source;
    }

    if (trainingSource != null) {
      this.trainingSources.push(trainingSource);
    }

    if (draftConfig.additionalTrainingSourceEnabled && draftConfig.additionalTrainingSource != null) {
      this.trainingSources.push(draftConfig.additionalTrainingSource!);
    }

    let draftingSource: TranslateSource | undefined;
    if (draftConfig.alternateSourceEnabled && draftConfig.alternateSource != null) {
      draftingSource = draftConfig.alternateSource;
    } else {
      draftingSource = project.translateConfig.source;
    }

    if (draftingSource != null) {
      this.draftingSources.push(draftingSource);
    }
  }

  confirmationChanged(change: MatCheckboxChange): void {
    this.languageCodesVerified.emit(change.checked);
  }

  displayNameForProjectsLanguages(projects: (TranslateSource | SFProjectProfile)[]): string {
    const uniqueTags = Array.from(new Set(projects.map(p => p.writingSystem.tag)));
    const displayNames = uniqueTags.map(tag => this.i18nService.getLanguageDisplayName(tag) ?? tag);
    return this.i18nService.enumerateList(displayNames);
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
    return this.i18nService.enumerateList(this.draftingSources.map(p => p.shortName));
  }
}
