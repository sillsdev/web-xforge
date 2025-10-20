import { CommonModule } from '@angular/common';
import { Component, DestroyRef, Input, OnInit } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { Router } from '@angular/router';
import { saveAs } from 'file-saver';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { DraftConfig, TranslateSource } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { catchError, firstValueFrom, lastValueFrom, Observable, of, Subscription, switchMap, throwError } from 'rxjs';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { I18nService } from 'xforge-common/i18n.service';
import { ElementState } from 'xforge-common/models/element-state';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { filterNullish, quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { WriteStatusComponent } from 'xforge-common/write-status/write-status.component';
import { ParatextService } from '../core/paratext.service';
import { SFProjectService } from '../core/sf-project.service';
import { BuildDto } from '../machine-api/build-dto';
import { JsonViewerComponent } from '../shared/json-viewer/json-viewer.component';
import { MobileNotSupportedComponent } from '../shared/mobile-not-supported/mobile-not-supported.component';
import { NoticeComponent } from '../shared/notice/notice.component';
import { SharedModule } from '../shared/shared.module';
import { projectLabel } from '../shared/utils';
import { DraftZipProgress } from '../translate/draft-generation/draft-generation';
import { DraftGenerationService } from '../translate/draft-generation/draft-generation.service';
import { DraftInformationComponent } from '../translate/draft-generation/draft-information/draft-information.component';
import { DraftSourcesAsTranslateSourceArrays, projectToDraftSources } from '../translate/draft-generation/draft-utils';
import { ServalAdministrationService } from './serval-administration.service';
interface Row {
  id: string;
  type: string;
  name: string;
  category: string;
  fileName: string;
  languageCode: string;
}

interface ProjectAndRange {
  source: string;
  scriptureRange: string;
}

function projectType(project: TranslateSource | SFProjectProfile): string {
  return ParatextService.isResource(project.paratextId) ? 'DBL resource' : 'Paratext project';
}

@Component({
  selector: 'app-serval-project',
  templateUrl: './serval-project.component.html',
  styleUrls: ['./serval-project.component.scss'],
  imports: [
    CommonModule,
    NoticeComponent,
    SharedModule,
    UICommonModule,
    DraftInformationComponent,
    MobileNotSupportedComponent,
    WriteStatusComponent,
    JsonViewerComponent
  ]
})
export class ServalProjectComponent extends DataLoadingComponent implements OnInit {
  @Input() showProjectTitle = true;
  preTranslate = false;
  projectName = '';

  headingsToDisplay = { category: 'Category', type: 'Type', name: 'Project', languageCode: 'Language tag', id: '' };
  columnsToDisplay = ['category', 'type', 'name', 'languageCode', 'id'];
  rows: Row[] = [];

  servalConfig = new FormControl<string | undefined>(undefined);
  form = new FormGroup({
    servalConfig: this.servalConfig
  });
  updateState = ElementState.InSync;

  trainingBooksByProject: ProjectAndRange[] = [];
  trainingFiles: string[] = [];
  translationBooksByProject: ProjectAndRange[] = [];

  downloadBooksProgress: number = 0;
  downloadBooksTotal: number = 0;

  draftConfig: Object | undefined;
  draftJob$: Observable<BuildDto | undefined> = new Observable<BuildDto | undefined>();
  lastCompletedBuild: BuildDto | undefined;
  rawLastCompletedBuild: any;
  zipSubscription: Subscription | undefined;

  constructor(
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly draftGenerationService: DraftGenerationService,
    private readonly i18n: I18nService,
    noticeService: NoticeService,
    private readonly onlineStatusService: OnlineStatusService,
    private readonly projectService: SFProjectService,
    private readonly router: Router,
    private readonly servalAdministrationService: ServalAdministrationService,
    private destroyRef: DestroyRef
  ) {
    super(noticeService);
  }

  get eventLogLink(): string[] {
    return ['/projects', this.activatedProjectService.projectId!, 'event-log'];
  }

  get draftSourcesLink(): string[] {
    return ['/projects', this.activatedProjectService.projectId!, 'draft-generation', 'sources'];
  }

  get isOnline(): boolean {
    return this.onlineStatusService.isOnline;
  }

  ngOnInit(): void {
    this.activatedProjectService.projectDoc$
      .pipe(
        filterNullish(),
        switchMap(projectDoc => {
          if (projectDoc.data == null) return of(undefined);
          const project: SFProjectProfile = projectDoc.data;
          this.preTranslate = project.translateConfig.preTranslate;
          this.projectName = projectLabel(project);
          const draftSources: DraftSourcesAsTranslateSourceArrays = projectToDraftSources(project);
          const draftConfig: DraftConfig = project.translateConfig.draftConfig;

          // Setup the downloads table
          const rows: Row[] = [];

          // Add the target
          rows.push({
            id: projectDoc.id,
            type: projectType(projectDoc.data),
            name: this.projectName,
            category: 'Target project',
            fileName: project.shortName + '.zip',
            languageCode: project.writingSystem.tag
          });

          let i = 1;
          // Add the draft sources
          for (const draftingSource of draftSources.draftingSources) {
            rows.push({
              id: draftingSource.projectRef,
              type: projectType(draftingSource),
              name: projectLabel(draftingSource),
              category: draftSources.draftingSources.length === 1 ? 'Draft source' : 'Draft source ' + i++,
              fileName: draftingSource.shortName + '.zip',
              languageCode: draftingSource.writingSystem.tag
            });
          }

          // Add the training sources (called reference projects)
          i = 1;
          for (const trainingSource of draftSources.trainingSources) {
            rows.push({
              id: trainingSource.projectRef,
              type: projectType(trainingSource),
              name: projectLabel(trainingSource),
              category: draftSources.trainingSources.length === 1 ? 'Reference project' : 'Reference project ' + i++,
              fileName: trainingSource.shortName + '.zip',
              languageCode: trainingSource.writingSystem.tag
            });
          }

          // We have to set the rows this way to trigger the update
          this.rows = rows;

          // Setup the books
          this.trainingBooksByProject = [];
          if (draftConfig.lastSelectedTrainingScriptureRanges != null) {
            let sourceCount = 1;
            for (const range of draftConfig.lastSelectedTrainingScriptureRanges) {
              this.trainingBooksByProject.push({
                source: `Source ${sourceCount++}`,
                scriptureRange: this.i18n.formatAndLocalizeScriptureRange(range.scriptureRange)
              });
            }
          }
          this.trainingFiles = draftConfig.lastSelectedTrainingDataFiles;
          this.translationBooksByProject = [];
          if (draftConfig.lastSelectedTranslationScriptureRanges != null) {
            let sourceCount = 1;
            for (const range of draftConfig.lastSelectedTranslationScriptureRanges) {
              this.translationBooksByProject.push({
                source: `Source ${sourceCount++}`,
                scriptureRange: this.i18n.formatAndLocalizeScriptureRange(range.scriptureRange)
              });
            }
          }

          this.draftConfig = draftConfig;
          this.draftJob$ = SFProjectService.hasDraft(project) ? this.getDraftJob(projectDoc.id) : of(undefined);

          // Setup the serval config value
          this.servalConfig.setValue(project.translateConfig.draftConfig.servalConfig);

          // Get the last completed build
          if (this.isOnline && SFProjectService.hasDraft(project)) {
            return this.draftGenerationService.getLastCompletedBuild(projectDoc.id);
          } else {
            return of(undefined);
          }
        }),
        quietTakeUntilDestroyed(this.destroyRef)
      )
      .subscribe(async (build: BuildDto | undefined) => {
        this.lastCompletedBuild = build;
        if (build?.id != null) {
          this.rawLastCompletedBuild = await firstValueFrom(this.draftGenerationService.getRawBuild(build.id));
        }
      });
  }

  async downloadDraft(): Promise<void> {
    this.zipSubscription?.unsubscribe();
    this.zipSubscription = this.draftGenerationService
      .downloadGeneratedDraftZip(this.activatedProjectService.projectDoc, this.lastCompletedBuild)
      .subscribe({
        next: (draftZipProgress: DraftZipProgress) => {
          this.downloadBooksProgress = draftZipProgress.current;
          this.downloadBooksTotal = draftZipProgress.total;
        },
        error: (error: Error) => void this.noticeService.showError(error.message)
      });
  }

  async downloadProject(id: string, fileName: string): Promise<void> {
    this.loadingStarted();

    // Download the zip file as a blob - this ensures we set the authorization header.
    const blob: Blob | undefined = await lastValueFrom(
      this.servalAdministrationService.downloadProject(id).pipe(
        catchError(err => {
          // Stop the loading, and throw the error
          this.loadingFinished();
          if (err.status === 404) {
            return of(undefined);
          } else {
            return throwError(() => err);
          }
        })
      )
    );

    // If the blob is undefined, display an error
    if (blob == null) {
      void this.noticeService.showError('The project was never synced successfully and does not exist on disk.');
      return;
    }

    // Use the FileSaver API to download the file
    saveAs(blob, fileName);

    this.loadingFinished();
  }

  onUpdatePreTranslate(newValue: boolean): Promise<void> {
    return this.projectService.onlineSetPreTranslate(this.activatedProjectService.projectId!, newValue);
  }

  async retrievePreTranslationStatus(): Promise<void> {
    await this.servalAdministrationService.onlineRetrievePreTranslationStatus(this.activatedProjectService.projectId!);
    await this.noticeService.show('Webhook job started.');
  }

  navigateToDraftJobs(): void {
    this.router.navigate(['/serval-administration'], {
      queryParams: {
        projectId: this.activatedProjectService.projectId!,
        tab: 'draft-jobs'
      }
    });
  }

  updateServalConfig(): void {
    if (
      this.activatedProjectService.projectDoc?.data == null ||
      (this.form.value.servalConfig ?? '') ===
        (this.activatedProjectService.projectDoc.data.translateConfig.draftConfig.servalConfig ?? '')
    ) {
      // Do not save if we do not have the project doc or if the configuration has not changed
      return;
    }

    // Update Serval Configuration
    const updateTaskPromise = this.projectService.onlineSetServalConfig(
      this.activatedProjectService.projectDoc.id,
      this.form.value.servalConfig
    );
    this.checkUpdateStatus(updateTaskPromise);
  }

  private checkUpdateStatus(updatePromise: Promise<void>): void {
    this.updateState = ElementState.Submitting;
    updatePromise
      .then(() => (this.updateState = ElementState.Submitted))
      .catch(() => (this.updateState = ElementState.Error));
  }

  private getDraftJob(projectId: string): Observable<BuildDto | undefined> {
    return this.draftGenerationService.getBuildProgress(projectId);
  }
}
