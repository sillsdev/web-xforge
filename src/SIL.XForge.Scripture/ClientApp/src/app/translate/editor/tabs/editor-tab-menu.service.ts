import { DestroyRef, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  EditorTabGroupType,
  EditorTabType,
  editorTabTypes
} from 'realtime-server/lib/esm/scriptureforge/models/editor-tab';
import { isParatextRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { combineLatest, forkJoin, map, Observable, of } from 'rxjs';
import { shareReplay, switchMap, take } from 'rxjs/operators';
import { TabMenuItem, TabMenuService, TabStateService } from 'src/app/shared/sf-tab-group';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { I18nService } from 'xforge-common/i18n.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { UserService } from 'xforge-common/user.service';
import { filterNullish } from 'xforge-common/util/rxjs-util';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { DraftGenerationService } from '../../draft-generation/draft-generation.service';
import { EditorTabInfo } from './editor-tabs.types';

@Injectable()
export class EditorTabMenuService implements TabMenuService<EditorTabGroupType> {
  private readonly menuItems$: Observable<TabMenuItem[]> = this.initMenuItems();

  constructor(
    private readonly destroyRef: DestroyRef,
    private readonly userService: UserService,
    private readonly activatedProject: ActivatedProjectService,
    private readonly draftGenerationService: DraftGenerationService,
    private readonly onlineStatus: OnlineStatusService,
    private readonly tabState: TabStateService<EditorTabGroupType, EditorTabInfo>,
    private readonly i18n: I18nService
  ) {}

  getMenuItems(): Observable<TabMenuItem[]> {
    // Return the same menu items for all tab groups
    return this.menuItems$;
  }

  private initMenuItems(): Observable<TabMenuItem[]> {
    return combineLatest([
      this.activatedProject.projectDoc$.pipe(filterNullish()),
      this.onlineStatus.onlineStatus$
    ]).pipe(
      takeUntilDestroyed(this.destroyRef),
      switchMap(([projectDoc, isOnline]) => {
        return combineLatest([
          of(projectDoc),
          of(isOnline),
          isOnline ? this.draftGenerationService.getLastCompletedBuild(projectDoc.id) : of(undefined),
          this.tabState.tabs$
        ]);
      }),
      switchMap(([projectDoc, isOnline, buildDto, existingTabs]) => {
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
            case 'project-resource':
              if (!isOnline || !this.canShowResource(projectDoc)) {
                continue;
              }
              break;
            case 'project-source':
            case 'project-target':
            default:
              continue;
          }

          const uniqueTabAlreadyExists = existingTabs.some(tab => tab.unique && tab.type === tabType);
          if (!uniqueTabAlreadyExists) {
            items.push(this.createMenuItem(tabType));
          }
        }

        return items.length > 0 ? forkJoin(items) : of([]);
      }),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

  private createMenuItem(tabType: EditorTabType): Observable<TabMenuItem> {
    switch (tabType) {
      case 'history':
        return this.i18n.translate('editor_tabs_menu.history_menu_item').pipe(
          take(1),
          map(localizedMenuItemText => ({
            type: 'history',
            icon: 'history',
            text: localizedMenuItemText
          }))
        );
      case 'draft':
        return this.i18n.translate('editor_tabs_menu.draft_menu_item').pipe(
          take(1),
          map(localizedMenuItemText => ({
            type: 'draft',
            icon: 'model_training',
            text: localizedMenuItemText
          }))
        );
      case 'project-resource':
        return this.i18n.translate('editor_tabs_menu.project_resource_menu_item').pipe(
          take(1),
          map(localizedMenuItemText => ({
            type: 'project-resource',
            icon: 'library_books',
            text: localizedMenuItemText
          }))
        );
      case 'project-source':
      case 'project-target':
        throw new Error(`'createMenuItem(EditorTabType)' does not support '${tabType}'`);
      default:
        throw new Error(`Unknown TabType: ${tabType}`);
    }
  }

  private canShowHistory(projectDoc: SFProjectProfileDoc | undefined): boolean {
    // The user must be a Paratext user. No specific edit permission for the chapter is required.
    return isParatextRole(projectDoc?.data?.userRoles[this.userService.currentUserId]);
  }

  private canShowResource(_projectDoc: SFProjectProfileDoc | undefined): boolean {
    // TODO: what role check is needed here?
    return true;
  }
}
