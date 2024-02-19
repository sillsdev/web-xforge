import { Injectable } from '@angular/core';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { combineLatest, forkJoin, map, Observable, of } from 'rxjs';
import { switchMap, take } from 'rxjs/operators';
import { NewTabMenuItem, NewTabMenuManager } from 'src/app/shared/sf-tab-group';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { I18nService } from 'xforge-common/i18n.service';
import { UserService } from 'xforge-common/user.service';
import { filterNullish } from 'xforge-common/util/rxjs-util';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { DraftGenerationService } from '../../draft-generation/draft-generation.service';
import { EditorTabsStateService } from './editor-tabs-state.service';
import { EditorTabGroupType, EditorTabType, editorTabTypes } from './editor-tabs.types';

@Injectable({
  providedIn: 'root'
})
export class EditorTabsMenuService implements NewTabMenuManager {
  constructor(
    private readonly userService: UserService,
    private readonly activatedProject: ActivatedProjectService,
    private readonly draftGenerationService: DraftGenerationService,
    private readonly editorTabsState: EditorTabsStateService,
    private readonly i18n: I18nService
  ) {}

  getMenuItems(_groupId: EditorTabGroupType): Observable<NewTabMenuItem[]> {
    return this.activatedProject.projectDoc$.pipe(
      filterNullish(),
      switchMap(projectDoc => {
        return combineLatest([
          of(projectDoc),
          this.draftGenerationService.getLastCompletedBuild(projectDoc.id),
          this.editorTabsState.tabs$
        ]);
      }),
      switchMap(([projectDoc, buildDto, existingTabs]) => {
        const showHistory = this.userHasGeneralEditRight(projectDoc);
        const showDraft = buildDto != null;
        const items: Observable<NewTabMenuItem>[] = [];

        for (const tabType of editorTabTypes) {
          switch (tabType) {
            case 'history':
              if (!showHistory) {
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

  private createMenuItem(tabType: EditorTabType): Observable<NewTabMenuItem> {
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
            icon: 'model_training',
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

  private userHasGeneralEditRight(projectDoc: SFProjectProfileDoc | undefined): boolean {
    const project = projectDoc?.data;
    if (project == null) {
      return false;
    }
    return SF_PROJECT_RIGHTS.hasRight(project, this.userService.currentUserId, SFProjectDomain.Texts, Operation.Edit);
  }
}
