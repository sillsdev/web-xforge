import { Component, DestroyRef, EventEmitter, OnInit, Output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatCheckboxChange, MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule } from '@ngneat/transloco';
import { TranslocoMarkupModule } from 'ngx-transloco-markup';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { TranslateSource } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { AuthService } from 'xforge-common/auth.service';
import { I18nService } from 'xforge-common/i18n.service';
import { NoticeComponent } from '../../../shared/notice/notice.component';
import { DraftSourcesService } from '../draft-sources.service';

@Component({
  selector: 'app-confirm-sources',
  standalone: true,
  imports: [TranslocoModule, NoticeComponent, MatCheckboxModule, MatIconModule, TranslocoMarkupModule],
  templateUrl: './confirm-sources.component.html',
  styleUrl: './confirm-sources.component.scss'
})
export class ConfirmSourcesComponent implements OnInit {
  @Output() languageCodesVerified = new EventEmitter<boolean>(false);

  trainingSources: TranslateSource[] = [];
  trainingTargets: TranslateSource[] = [];
  draftingSources: TranslateSource[] = [];

  protected warnTrainingAndDraftingSourceLanguagesNotCompatible = false;
  protected warnTrainingSourceLanguagesNotCompatible = false;
  protected projectSettingsUrl?: string;

  constructor(
    private readonly destroyRef: DestroyRef,
    private readonly i18nService: I18nService,
    private readonly draftSourcesService: DraftSourcesService,
    private readonly activatedProject: ActivatedProjectService,
    private readonly authService: AuthService
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

  get isProjectAdmin(): boolean {
    const userId = this.authService.currentUserId;
    if (userId != null) {
      return this.activatedProject.projectDoc?.data?.userRoles[userId] === SFProjectRole.ParatextAdministrator;
    }
    return false;
  }

  ngOnInit(): void {
    this.draftSourcesService
      .getDraftProjectSources()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(async ({ trainingTargets, trainingSources, draftingSources }) => {
        this.trainingSources = trainingSources.filter(s => s !== undefined);
        this.trainingTargets = trainingTargets.filter(t => t !== undefined);
        this.draftingSources = draftingSources.filter(s => s !== undefined);

        // compare language codes
        this.warnTrainingSourceLanguagesNotCompatible =
          this.trainingSources.length >= 1 &&
          this.sourceLanguagesAreCompatible(this.trainingSources[0], this.trainingSources[1]);
        this.warnTrainingAndDraftingSourceLanguagesNotCompatible = this.sourceLanguagesAreCompatible(
          this.trainingSources[0],
          this.draftingSources[0]
        );
      });

    this.activatedProject.projectId$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(projectId => {
      this.projectSettingsUrl = `/projects/${projectId}/settings`;
    });
  }

  confirmationChanged(change: MatCheckboxChange): void {
    this.languageCodesVerified.emit(change.checked);
  }

  displayNameForProjectsLanguages(projects: (TranslateSource | SFProjectProfile | undefined)[]): string {
    const uniqueTags = Array.from(new Set(projects.filter(p => p != null).map(p => p.writingSystem.tag)));
    const displayNames = uniqueTags.map(tag => this.i18nService.getLanguageDisplayName(tag) ?? tag);
    return this.i18nService.enumerateList(displayNames);
  }

  /**
   * Determines of the source languages for the project are compatible for generating a draft.
   */
  private sourceLanguagesAreCompatible(source: TranslateSource, other: TranslateSource): boolean {
    if (source.writingSystem.tag === other.writingSystem.tag) return true;
    return this.i18nService.languageCodesEquivalent(source.writingSystem.tag, other.writingSystem.tag);
  }
}
