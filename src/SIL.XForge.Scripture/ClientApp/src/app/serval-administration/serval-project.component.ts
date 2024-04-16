import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { catchError, lastValueFrom, tap, throwError } from 'rxjs';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { filterNullish } from 'xforge-common/util/rxjs-util';
import { SFProjectService } from '../core/sf-project.service';
import { NoticeComponent } from '../shared/notice/notice.component';
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
  imports: [CommonModule, NoticeComponent, UICommonModule],
  standalone: true
})
export class ServalProjectComponent extends DataLoadingComponent implements OnInit {
  preTranslate = false;
  projectName = '';

  headingsToDisplay = { category: 'Category', name: 'Project', id: '' };
  columnsToDisplay = ['category', 'name', 'id'];
  rows: Row[] = [];

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
            !this.servalAdministrationService.isResource(project.translateConfig.source.paratextId)
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
            !this.servalAdministrationService.isResource(project.translateConfig.draftConfig.alternateSource.paratextId)
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
            !this.servalAdministrationService.isResource(
              project.translateConfig.draftConfig.alternateTrainingSource.paratextId
            )
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
        })
      )
    );
  }

  async downloadProject(id: string, fileName: string): Promise<void> {
    this.loadingStarted();

    // Download the zip file as a blob - this ensures we set the authorization header.
    const blob: Blob = await lastValueFrom(
      this.servalAdministrationService.downloadProject(id).pipe(
        catchError(err => {
          // Stop the loading, and throw the error
          this.loadingFinished();
          return throwError(() => err);
        })
      )
    );

    // Trigger a click that downloads the blob
    // NOTE: This code should not be unit tested, as it will trigger downloads in the test browser
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    this.loadingFinished();
  }

  onUpdatePreTranslate(newValue: boolean): Promise<void> {
    return this.projectService.onlineSetPreTranslate(this.activatedProjectService.projectId!, newValue);
  }
}
