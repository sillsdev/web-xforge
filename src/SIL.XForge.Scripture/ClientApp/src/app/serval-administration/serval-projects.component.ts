import { Component, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Project } from 'realtime-server/lib/esm/common/models/project';
import { obj } from 'realtime-server/lib/esm/common/utils/obj-path';
import { SFProject, SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { BehaviorSubject } from 'rxjs';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { I18nService } from 'xforge-common/i18n.service';
import { NoticeService } from 'xforge-common/notice.service';
import { QueryParameters } from 'xforge-common/query-parameters';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { QuietDestroyRef } from 'xforge-common/utils';
import { SFProjectProfileDoc } from '../core/models/sf-project-profile-doc';
import { ServalAdministrationService } from './serval-administration.service';

class Row {
  constructor(public readonly projectDoc: SFProjectProfileDoc) {}

  get alternateSource(): string {
    const alternateDraftingSource = this.projectDoc.data?.translateConfig.draftConfig.alternateSource;
    return alternateDraftingSource == null
      ? 'None'
      : alternateDraftingSource.shortName + ' - ' + alternateDraftingSource.name;
  }

  get alternateSourceId(): string | undefined {
    return this.projectDoc.data?.translateConfig.draftConfig.alternateSource?.projectRef;
  }

  get alternateTrainingSource(): string {
    const alternateTrainingSource = this.projectDoc.data?.translateConfig.draftConfig.alternateTrainingSource;
    return alternateTrainingSource == null
      ? 'None'
      : alternateTrainingSource.shortName + ' - ' + alternateTrainingSource.name;
  }

  get alternateTrainingSourceId(): string | undefined {
    return this.projectDoc.data?.translateConfig.draftConfig.alternateTrainingSource?.projectRef;
  }

  get id(): string {
    return this.projectDoc.id;
  }

  get name(): string {
    return this.projectDoc.data == null ? 'N/A' : this.projectDoc.data.shortName + ' - ' + this.projectDoc.data.name;
  }

  get preTranslate(): boolean {
    return this.projectDoc.data?.translateConfig.preTranslate ?? false;
  }

  get source(): string {
    const source = this.projectDoc.data?.translateConfig.source;
    return source == null ? 'None' : source.shortName + ' - ' + source.name;
  }

  get sourceId(): string | undefined {
    return this.projectDoc.data?.translateConfig.source?.projectRef;
  }
}

@Component({
  selector: 'app-serval-projects',
  templateUrl: './serval-projects.component.html',
  styleUrls: ['./serval-projects.component.scss'],
  standalone: true,
  imports: [UICommonModule]
})
export class ServalProjectsComponent extends DataLoadingComponent implements OnInit {
  columnsToDisplay: string[] = ['name', 'preTranslate', 'source', 'alternateSource', 'alternateTrainingSource'];
  rows: Row[] = [];

  length: number = 0;
  pageIndex: number = 0;
  pageSize: number = 50;

  private projectDocs?: Readonly<SFProjectProfileDoc[]>;

  private readonly searchTerm$: BehaviorSubject<string>;
  private readonly queryParameters$: BehaviorSubject<QueryParameters>;

  constructor(
    noticeService: NoticeService,
    readonly i18n: I18nService,
    private readonly servalAdministrationService: ServalAdministrationService,
    private destroyRef: QuietDestroyRef
  ) {
    super(noticeService);
    this.searchTerm$ = new BehaviorSubject<string>('');
    this.queryParameters$ = new BehaviorSubject<QueryParameters>(this.getQueryParameters());
  }

  get isLoading(): boolean {
    return this.projectDocs == null;
  }

  ngOnInit(): void {
    this.loadingStarted();
    this.servalAdministrationService
      .onlineQuery(this.searchTerm$, this.queryParameters$, [
        obj<Project>().pathStr(p => p.name),
        obj<SFProjectProfile>().pathStr(p => p.shortName)
      ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(searchResults => {
        this.projectDocs = searchResults.docs;
        this.length = searchResults.unpagedCount;
        this.generateRows();
        this.loadingFinished();
      });
  }

  updateSearchTerm(target: EventTarget | null): void {
    const termTarget = target as HTMLInputElement;
    if (termTarget?.value != null) {
      this.searchTerm$.next(termTarget.value);
    }
  }

  updatePage(pageIndex: number, pageSize: number): void {
    this.pageIndex = pageIndex;
    this.pageSize = pageSize;
    this.queryParameters$.next(this.getQueryParameters());
  }

  private generateRows(): void {
    if (this.projectDocs == null) {
      return;
    }

    const rows: Row[] = [];
    for (const projectDoc of this.projectDocs) {
      rows.push(new Row(projectDoc));
    }
    this.rows = rows;
  }

  private getQueryParameters(): QueryParameters {
    return {
      // Do not return resources
      [obj<SFProject>().pathStr(q => q.resourceConfig)]: null,
      $sort: { [obj<Project>().pathStr(p => p.name)]: 1 },
      $skip: this.pageIndex * this.pageSize,
      $limit: this.pageSize
    };
  }
}
