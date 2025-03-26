import { Injectable } from '@angular/core';
import { EditorTabGroupType, EditorTabType } from 'realtime-server/lib/esm/scriptureforge/models/editor-tab';
import { map, Observable, of, switchMap, take } from 'rxjs';
import { DialogService } from 'xforge-common/dialog.service';
import { filterNullish } from 'xforge-common/util/rxjs-util';
import { SFProjectDoc } from '../../../core/models/sf-project-doc';
import { PermissionsService } from '../../../core/permissions.service';
import { SFProjectService } from '../../../core/sf-project.service';
import { TabStateService } from '../../../shared/sf-tab-group';
import { TabAddRequestService } from '../../../shared/sf-tab-group/base-services/tab-add-request.service';
import {
  EditorTabAddResourceDialogComponent,
  EditorTabAddResourceDialogData
} from './editor-tab-add-resource-dialog/editor-tab-add-resource-dialog.component';
import { EditorTabInfo } from './editor-tabs.types';

@Injectable({
  providedIn: 'root'
})
export class EditorTabAddRequestService implements TabAddRequestService<EditorTabType, EditorTabInfo> {
  constructor(
    private readonly dialogService: DialogService,
    private readonly projectService: SFProjectService,
    private readonly permissionsService: PermissionsService,
    private readonly tabState: TabStateService<EditorTabGroupType, EditorTabInfo>
  ) {}

  handleTabAddRequest(tabType: EditorTabType): Observable<Partial<EditorTabInfo> | never> {
    switch (tabType) {
      case 'project-resource':
        // Exclude any resources that are already open in a tab
        return this.getParatextIdsForOpenTabs().pipe(
          switchMap(paratextIds => this.promptUserResourceSelection(paratextIds))
        );
      default:
        // No extra tab info
        return of({});
    }
  }

  /**
   * Gets the paratext id for each open project tab with a projectId.
   */
  private getParatextIdsForOpenTabs(): Observable<string[]> {
    return this.tabState.tabs$.pipe(
      take(1),
      switchMap(tabs =>
        Promise.all(
          tabs.map(async tab =>
            tab.projectId != null && (await this.permissionsService.isUserOnProject(tab.projectId))
              ? this.projectService.get(tab.projectId)
              : undefined
          )
        )
      ),
      map(projectDocs => projectDocs.map(doc => doc?.data?.paratextId).filter(id => id) as string[])
    );
  }

  /**
   * Opens a dialog that prompts the user to select a paratext project or DBL resource, excluding any
   * resources that are already open in a tab.
   * @param excludedParatextIds List of paratext ids for resources that should not be listed as options for selection.
   * @returns An observable containing data for the selected resource.
   * The returned observable will not emit if no resource was selected.
   */
  private promptUserResourceSelection(excludedParatextIds: string[]): Observable<Partial<EditorTabInfo> | never> {
    return this.dialogService
      .openMatDialog<EditorTabAddResourceDialogComponent, EditorTabAddResourceDialogData>(
        EditorTabAddResourceDialogComponent,
        {
          panelClass: 'editor-tab-add-resource-dialog',
          disableClose: true, // Ensure explicit cancellation by user
          width: '700px',
          data: {
            // Don't show projects/resources that are already open in a tab
            excludedParatextIds
          }
        }
      )
      .afterClosed()
      .pipe(
        filterNullish(),
        map((projectDoc: SFProjectDoc) => {
          return {
            projectId: projectDoc.id,
            headerText: projectDoc.data?.shortName,
            tooltip: projectDoc.data?.name
          };
        })
      );
  }
}
