import { Injectable } from '@angular/core';
import { EditorTabGroupType, EditorTabType } from 'realtime-server/lib/esm/scriptureforge/models/editor-tab';
import { map, Observable, of, switchMap, take } from 'rxjs';
import { DialogService } from 'xforge-common/dialog.service';
import { filterNullish } from 'xforge-common/util/rxjs-util';
import { SFProjectDoc } from '../../../core/models/sf-project-doc';
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
    private readonly tabState: TabStateService<EditorTabGroupType, EditorTabInfo>
  ) {}

  handleTabAddRequest(tabType: EditorTabType): Observable<Partial<EditorTabInfo> | never> {
    switch (tabType) {
      case 'project-resource':
        return this.getParatextIdsForOpenTabs().pipe(
          switchMap(paratextIds => {
            return this.dialogService
              .openMatDialog<EditorTabAddResourceDialogComponent, EditorTabAddResourceDialogData>(
                EditorTabAddResourceDialogComponent,
                {
                  panelClass: 'editor-tab-add-resource-dialog',
                  width: '700px',
                  data: {
                    // Don't show projects/resources that are already open in a tab
                    excludedParatextIds: paratextIds
                  }
                }
              )
              .afterClosed()
              .pipe(
                filterNullish(),
                map((projectDoc: SFProjectDoc) => {
                  return {
                    projectId: projectDoc.id,
                    headerText: projectDoc.data?.shortName
                  };
                })
              );
          })
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
        Promise.all(tabs.map(tab => (tab.projectId != null ? this.projectService.get(tab.projectId) : undefined)))
      ),
      map(projectDocs => projectDocs.map(doc => doc?.data?.paratextId).filter(id => id) as string[])
    );
  }
}
