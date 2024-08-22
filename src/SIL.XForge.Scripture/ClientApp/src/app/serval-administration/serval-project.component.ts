import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Canon } from '@sillsdev/scripture';
import { saveAs } from 'file-saver';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { catchError, lastValueFrom, of, tap, throwError } from 'rxjs';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { filterNullish } from 'xforge-common/util/rxjs-util';
import { ParatextService } from '../core/paratext.service';
import { SFProjectService } from '../core/sf-project.service';
import { NoticeComponent } from '../shared/notice/notice.component';
import { SharedModule } from '../shared/shared.module';
import { ServalAdministrationService } from './serval-administration.service';

interface Row {
  id: string;
  name: string;
  category: string;
  fileName: string;
}

@Component({
  selector: 'app-serval-project',
  templateUrl: './serval-project.component.html',
  styleUrls: ['./serval-project.component.scss'],
  imports: [CommonModule, NoticeComponent, SharedModule, UICommonModule],
  standalone: true
})
export class ServalProjectComponent extends DataLoadingComponent implements OnInit {
  preTranslate = false;
  projectName = '';

  headingsToDisplay = { category: 'Category', name: 'Project', id: '' };
  columnsToDisplay = ['category', 'name', 'id'];
  rows: Row[] = [];

  trainingBooks: string[] = [];
  trainingFiles: string[] = [];
  translationBooks: string[] = [];

  draftConfig: Object | undefined;

  constructor(
    private readonly activatedProjectService: ActivatedProjectService,
    noticeService: NoticeService,
    private readonly onlineStatusService: OnlineStatusService,
    private readonly projectService: SFProjectService,
    private readonly servalAdministrationService: ServalAdministrationService
  ) {
    super(noticeService);
  }

  get isOnline(): boolean {
    return this.onlineStatusService.isOnline;
  }

  ngOnInit(): void {
    this.subscribe(
      this.activatedProjectService.projectDoc$.pipe(
        filterNullish(),
        tap(projectDoc => {
          if (projectDoc.data == null) return;
          const project: SFProjectProfile = projectDoc.data;
          this.preTranslate = project.translateConfig.preTranslate;
          this.projectName = project.shortName + ' - ' + project.name;

          // Setup the downloads table
          const rows: Row[] = [];

          // Add the target
          rows.push({
            id: projectDoc.id,
            name: this.projectName,
            category: 'Target Project',
            fileName: project.shortName + '.zip'
          });

          // Add the source
          if (
            project.translateConfig.source != null &&
            !ParatextService.isResource(project.translateConfig.source.paratextId)
          ) {
            rows.push({
              id: project.translateConfig.source.projectRef,
              name: project.translateConfig.source.shortName + ' - ' + project.translateConfig.source.name,
              category: 'Source Project',
              fileName: project.translateConfig.source.shortName + '.zip'
            });
          }

          // Add the alternate source
          if (
            project.translateConfig.draftConfig.alternateSource != null &&
            !ParatextService.isResource(project.translateConfig.draftConfig.alternateSource.paratextId)
          ) {
            rows.push({
              id: project.translateConfig.draftConfig.alternateSource.projectRef,
              name:
                project.translateConfig.draftConfig.alternateSource.shortName +
                ' - ' +
                project.translateConfig.draftConfig.alternateSource.name,
              category: 'Alternate Source',
              fileName: project.translateConfig.draftConfig.alternateSource.shortName + '.zip'
            });
          }

          // Add the alternate training source
          if (
            project.translateConfig.draftConfig.alternateTrainingSource != null &&
            !ParatextService.isResource(project.translateConfig.draftConfig.alternateTrainingSource.paratextId)
          ) {
            rows.push({
              id: project.translateConfig.draftConfig.alternateTrainingSource.projectRef,
              name:
                project.translateConfig.draftConfig.alternateTrainingSource.shortName +
                ' - ' +
                project.translateConfig.draftConfig.alternateTrainingSource.name,
              category: 'Alternate Training Source',
              fileName: project.translateConfig.draftConfig.alternateTrainingSource.shortName + '.zip'
            });
          }

          // We have to set the rows this way to trigger the update
          this.rows = rows;

          // Setup the books
          this.trainingBooks = project.translateConfig.draftConfig.lastSelectedTrainingBooks.map(bookNum =>
            Canon.bookNumberToEnglishName(bookNum)
          );
          this.trainingFiles = project.translateConfig.draftConfig.lastSelectedTrainingDataFiles;
          this.translationBooks = project.translateConfig.draftConfig.lastSelectedTranslationBooks.map(bookNum =>
            Canon.bookNumberToEnglishName(bookNum)
          );

          this.draftConfig = project.translateConfig.draftConfig;
        })
      )
    );
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
    return '[' + value.join(', ') + ']';
  }
}
