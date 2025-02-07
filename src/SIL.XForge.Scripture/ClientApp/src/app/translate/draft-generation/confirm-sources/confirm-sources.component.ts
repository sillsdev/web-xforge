import { Component, DestroyRef, EventEmitter, OnInit, Output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule } from '@ngneat/transloco';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { TranslateSource } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { I18nService } from 'xforge-common/i18n.service';
import { DraftSourcesAsArrays, DraftSourcesService } from '../draft-sources.service';
import { LanguageCodesConfirmationComponent } from '../language-codes-confirmation/language-codes-confirmation.component';

@Component({
  selector: 'app-confirm-sources',
  standalone: true,
  imports: [TranslocoModule, MatCheckboxModule, MatIconModule, LanguageCodesConfirmationComponent],
  templateUrl: './confirm-sources.component.html',
  styleUrl: './confirm-sources.component.scss'
})
export class ConfirmSourcesComponent implements OnInit {
  @Output() languageCodesVerified = new EventEmitter<boolean>(false);

  trainingSources: TranslateSource[] = [];
  trainingTargets: TranslateSource[] = [];
  draftingSources: TranslateSource[] = [];
  draftSources?: DraftSourcesAsArrays;

  protected warnTrainingAndDraftingSourceLanguagesNotCompatible = false;
  protected warnTrainingSourceLanguagesNotCompatible = false;
  protected projectSettingsUrl?: string;

  constructor(
    private readonly destroyRef: DestroyRef,
    private readonly i18nService: I18nService,
    private readonly draftSourcesService: DraftSourcesService
  ) {}

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

  ngOnInit(): void {
    this.draftSourcesService
      .getDraftProjectSources()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(async ({ trainingTargets, trainingSources, draftingSources }) => {
        this.draftSources = { trainingTargets, trainingSources, draftingSources };
        this.trainingSources = trainingSources.filter(s => s !== undefined);
        this.trainingTargets = trainingTargets.filter(t => t !== undefined);
        this.draftingSources = draftingSources.filter(s => s !== undefined);
      });
  }

  confirmationChanged(checked: boolean): void {
    this.languageCodesVerified.emit(checked);
  }

  displayNameForProjectsLanguages(projects: (TranslateSource | SFProjectProfile | undefined)[]): string {
    const uniqueTags = Array.from(new Set(projects.filter(p => p != null).map(p => p.writingSystem.tag)));
    const displayNames = uniqueTags.map(tag => this.i18nService.getLanguageDisplayName(tag) ?? tag);
    return this.i18nService.enumerateList(displayNames);
  }
}
