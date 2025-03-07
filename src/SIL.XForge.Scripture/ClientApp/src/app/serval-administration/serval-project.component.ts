import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Canon } from '@sillsdev/scripture';
import { saveAs } from 'file-saver';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { DraftConfig, TranslateSource } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { catchError, lastValueFrom, Observable, of, Subscription, switchMap, throwError } from 'rxjs';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { filterNullish } from 'xforge-common/util/rxjs-util';
import { QuietDestroyRef } from 'xforge-common/utils';
import { ParatextService } from '../core/paratext.service';
import { SFProjectService } from '../core/sf-project.service';
import { BuildDto } from '../machine-api/build-dto';
import { MobileNotSupportedComponent } from '../shared/mobile-not-supported/mobile-not-supported.component';
import { NoticeComponent } from '../shared/notice/notice.component';
import { SharedModule } from '../shared/shared.module';
import { booksFromScriptureRange, projectLabel } from '../shared/utils';
import { DraftZipProgress } from '../translate/draft-generation/draft-generation';
import { DraftGenerationService } from '../translate/draft-generation/draft-generation.service';
import { DraftInformationComponent } from '../translate/draft-generation/draft-information/draft-information.component';
import { ServalAdministrationService } from './serval-administration.service';

interface Row {
  id: string;
  type: string;
  name: string;
  category: string;
  fileName: string;
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
    MobileNotSupportedComponent
  ],
  standalone: true
})
export class ServalProjectComponent extends DataLoadingComponent implements OnInit {
  @Input() showProjectTitle = true;
  preTranslate = false;
  projectName = '';

  headingsToDisplay = { category: 'Category', type: 'Type', name: 'Project', id: '' };
  columnsToDisplay = ['category', 'type', 'name', 'id'];
  rows: Row[] = [];

  trainingBooksByProject: ProjectAndRange[] = [];
  trainingFiles: string[] = [];
  translationBooks: string[] = [];

  downloadBooksProgress: number = 0;
  downloadBooksTotal: number = 0;

  draftConfig: Object | undefined;
  draftJob$: Observable<BuildDto | undefined> = new Observable<BuildDto | undefined>();
  lastCompletedBuild: BuildDto | undefined;
  zipSubscription: Subscription | undefined;

  constructor(
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly draftGenerationService: DraftGenerationService,
    noticeService: NoticeService,
    private readonly onlineStatusService: OnlineStatusService,
    private readonly projectService: SFProjectService,
    private readonly servalAdministrationService: ServalAdministrationService,
    private destroyRef: QuietDestroyRef
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

          // Setup the downloads table
          const rows: Row[] = [];

          // Add the target
          rows.push({
            id: projectDoc.id,
            type: projectType(projectDoc.data),
            name: this.projectName,
            category: 'Target Project',
            fileName: project.shortName + '.zip'
          });

          // Add the source
          if (project.translateConfig.source != null) {
            rows.push({
              id: project.translateConfig.source.projectRef,
              type: projectType(project.translateConfig.source),
              name: project.translateConfig.source.shortName + ' - ' + project.translateConfig.source.name,
              category: 'Source Project',
              fileName: project.translateConfig.source.shortName + '.zip'
            });
          }

          const draftConfig: DraftConfig = project.translateConfig.draftConfig;
          // Add the alternate source
          if (draftConfig.alternateSource != null) {
            rows.push({
              id: draftConfig.alternateSource.projectRef,
              type: projectType(draftConfig.alternateSource),
              name: draftConfig.alternateSource.shortName + ' - ' + draftConfig.alternateSource.name,
              category: 'Alternate Source',
              fileName: draftConfig.alternateSource.shortName + '.zip'
            });
          }

          // Add the alternate training source
          if (draftConfig.alternateTrainingSource != null) {
            rows.push({
              id: draftConfig.alternateTrainingSource.projectRef,
              type: projectType(draftConfig.alternateTrainingSource),
              name: draftConfig.alternateTrainingSource.shortName + ' - ' + draftConfig.alternateTrainingSource.name,
              category: 'Alternate Training Source',
              fileName: draftConfig.alternateTrainingSource.shortName + '.zip'
            });
          }

          // Add the additional training source
          if (draftConfig.additionalTrainingSource != null) {
            rows.push({
              id: draftConfig.additionalTrainingSource.projectRef,
              type: projectType(draftConfig.additionalTrainingSource),
              name: draftConfig.additionalTrainingSource.shortName + ' - ' + draftConfig.additionalTrainingSource.name,
              category: 'Additional Training Source',
              fileName: draftConfig.additionalTrainingSource.shortName + '.zip'
            });
          }

          // We have to set the rows this way to trigger the update
          this.rows = rows;

          // Setup the books
          this.trainingBooksByProject = [];
          if (draftConfig.lastSelectedTrainingScriptureRange != null) {
            this.trainingBooksByProject.push({
              source: 'Source 1',
              scriptureRange: booksFromScriptureRange(draftConfig.lastSelectedTrainingScriptureRange ?? '')
                .map(bookNum => Canon.bookNumberToEnglishName(bookNum))
                .join(', ')
            });
          } else if (draftConfig.lastSelectedTrainingScriptureRanges != null) {
            let sourceCount = 1;
            for (const range of draftConfig.lastSelectedTrainingScriptureRanges) {
              this.trainingBooksByProject.push({
                source: `Source ${sourceCount++}`,
                scriptureRange: booksFromScriptureRange(range.scriptureRange)
                  .map(bookNum => Canon.bookNumberToEnglishName(bookNum))
                  .join(', ')
              });
            }
          }
          this.trainingFiles = draftConfig.lastSelectedTrainingDataFiles;
          this.translationBooks = booksFromScriptureRange(draftConfig.lastSelectedTranslationScriptureRange ?? '').map(
            bookNum => Canon.bookNumberToEnglishName(bookNum)
          );

          this.draftConfig = draftConfig;
          this.draftJob$ = SFProjectService.hasDraft(project) ? this.getDraftJob(projectDoc.id) : of(undefined);

          // Get the last completed build
          if (this.isOnline && SFProjectService.hasDraft(project)) {
            return this.draftGenerationService.getLastCompletedBuild(projectDoc.id);
          } else {
            return of(undefined);
          }
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((build: BuildDto | undefined) => {
        this.lastCompletedBuild = build;
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
        error: (error: Error) => this.noticeService.showError(error.message)
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
      this.noticeService.showError('The project was never synced successfully and does not exist on disk.');
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

  keys(obj: Object): string[] {
    return Object.keys(obj);
  }

  stringify(value: any): string {
    if (Array.isArray(value)) {
      return this.arrayToString(value);
    }
    return JSON.stringify(value, (_key, value) => (Array.isArray(value) ? this.arrayToString(value) : value), 2);
  }

  arrayToString(value: any): string {
    const isObject = typeof value[0] === 'object';
    const contents = isObject ? value.map(x => this.stringify(x)).join(', ') : value.join(', ');
    return '[' + contents + ']';
  }

  private getDraftJob(projectId: string): Observable<BuildDto | undefined> {
    return this.draftGenerationService.getBuildProgress(projectId);
  }
}
