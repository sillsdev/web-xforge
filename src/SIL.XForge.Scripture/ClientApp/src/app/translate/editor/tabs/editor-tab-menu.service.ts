import { Injectable } from '@angular/core';
import { isParatextRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { combineLatest, forkJoin, map, Observable, of } from 'rxjs';
import { switchMap, take } from 'rxjs/operators';
import { TabMenuItem, TabMenuService, TabStateService } from 'src/app/shared/sf-tab-group';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { I18nService } from 'xforge-common/i18n.service';
import { UserService } from 'xforge-common/user.service';
import { filterNullish } from 'xforge-common/util/rxjs-util';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { DraftGenerationService } from '../../draft-generation/draft-generation.service';
import { EditorTabGroupType, EditorTabInfo, EditorTabType, editorTabTypes } from './editor-tabs.types';

@Injectable({
  providedIn: 'root'
})
export class EditorTabMenuService implements TabMenuService<EditorTabGroupType> {
  constructor(
    private readonly userService: UserService,
    private readonly activatedProject: ActivatedProjectService,
    private readonly draftGenerationService: DraftGenerationService,
    private readonly tabState: TabStateService<EditorTabGroupType, EditorTabInfo>,
    private readonly i18n: I18nService
  ) {}

  getMenuItems(): Observable<TabMenuItem[]> {
    return this.activatedProject.projectDoc$.pipe(
      filterNullish(),
      switchMap(projectDoc => {
        return combineLatest([
          of(projectDoc),
          this.draftGenerationService.getLastCompletedBuild(projectDoc.id),
          this.tabState.tabs$
        ]);
      }),
      switchMap(([projectDoc, buildDto, existingTabs]) => {
        const showDraft = buildDto != null;
        const items: Observable<TabMenuItem>[] = [];

        for (const tabType of editorTabTypes) {
          switch (tabType) {
            case 'history':
              if (!this.canShowHistory(projectDoc)) {
                continue;
              }
              break;
            case 'draft':
              if (!showDraft) {
                continue;
              }
              break;
            // TODO: Add support for project-source tabs
            case 'project-source':
            case 'project':
            default:
              continue;
          }

          const uniqueTabAlreadyExists = existingTabs.some(tab => tab.unique && tab.type === tabType);
          if (!uniqueTabAlreadyExists) {
            items.push(this.createMenuItem(tabType));
          }
        }

        return items.length > 0 ? forkJoin(items) : of([]);
      })
    );
  }

  private createMenuItem(tabType: EditorTabType): Observable<TabMenuItem> {
    switch (tabType) {
      case 'history':
        return this.i18n.translate('editor_tabs_menu.history_tab_header').pipe(
          take(1),
          map(localizedHeaderText => ({
            type: 'history',
            icon: 'history',
            text: localizedHeaderText
          }))
        );
      case 'draft':
        return this.i18n.translate('editor_tabs_menu.draft_tab_header').pipe(
          take(1),
          map(localizedHeaderText => ({
            type: 'draft',
            icon: 'auto_awesome',
            text: localizedHeaderText
          }))
        );
      // TODO: Add support for project-source tabs
      case 'project-source':
      case 'project':
        throw new Error(`'createMenuItem(EditorTabType)' does not support '${tabType}'`);
      default:
        throw new Error(`Unknown TabType: ${tabType}`);
    }
  }

  private canShowHistory(projectDoc: SFProjectProfileDoc | undefined): boolean {
    // The user must be a Paratext user. No specific edit permission for the chapter is required.
    return isParatextRole(projectDoc?.data?.userRoles[this.userService.currentUserId]);
  }
}
