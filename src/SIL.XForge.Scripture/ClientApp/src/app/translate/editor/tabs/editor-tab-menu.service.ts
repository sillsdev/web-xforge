import { DestroyRef, Injectable } from '@angular/core';
import {
  EditorTabGroupType,
  EditorTabType,
  editorTabTypes
} from 'realtime-server/lib/esm/scriptureforge/models/editor-tab';
import { isParatextRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { combineLatest, map, Observable, of } from 'rxjs';
import { shareReplay, startWith, switchMap } from 'rxjs/operators';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { I18nService } from 'xforge-common/i18n.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { UserService } from 'xforge-common/user.service';
import { filterNullish, quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { ParatextService } from '../../../core/paratext.service';
import { PermissionsService } from '../../../core/permissions.service';
import { SFProjectService } from '../../../core/sf-project.service';
import { BuildDto } from '../../../machine-api/build-dto';
import { TabMenuItem, TabMenuService, TabStateService } from '../../../shared/sf-tab-group';
import { DraftGenerationService } from '../../draft-generation/draft-generation.service';
import { DraftOptionsService } from '../../draft-generation/draft-options.service';
import { EditorTabInfo } from './editor-tabs.types';

@Injectable()
export class EditorTabMenuService implements TabMenuService<EditorTabGroupType> {
  // TODO: Detect when a new draft build is available so we can update the latest build
  // This is ugly, but null means it doesn't exist, 'loading' means we don't know yet
  private readonly latestDraftBuild$: Observable<BuildDto | null | 'loading'> = this.activatedProject.projectId$.pipe(
    switchMap(projectId =>
      projectId == null
        ? of(null)
        : this.draftGenerationService.getLastCompletedBuild(projectId).pipe(
            map(build => build ?? null),
            startWith('loading' as const)
          )
    )
  );

  private readonly menuItems$: Observable<TabMenuItem[]> = this.initMenuItems();

  constructor(
    private readonly destroyRef: DestroyRef,
    private readonly userService: UserService,
    private readonly activatedProject: ActivatedProjectService,
    private readonly onlineStatus: OnlineStatusService,
    private readonly tabState: TabStateService<EditorTabGroupType, EditorTabInfo>,
    private readonly permissionsService: PermissionsService,
    private readonly i18n: I18nService,
    private readonly draftOptionsService: DraftOptionsService,
    private readonly draftGenerationService: DraftGenerationService
  ) {}

  getMenuItems(): Observable<TabMenuItem[]> {
    // Return the same menu items for all tab groups
    return this.menuItems$;
  }

  private initMenuItems(): Observable<TabMenuItem[]> {
    return combineLatest([
      this.activatedProject.projectDoc$.pipe(filterNullish()),
      this.onlineStatus.onlineStatus$,
      this.latestDraftBuild$
    ]).pipe(
      quietTakeUntilDestroyed(this.destroyRef),
      switchMap(([projectDoc, isOnline, latestDraftBuild]) => {
        return combineLatest([of(projectDoc), of(isOnline), this.tabState.tabs$, of(latestDraftBuild)]);
      }),
      switchMap(([projectDoc, isOnline, existingTabs, latestDraftBuild]) => {
        const showDraft =
          isOnline &&
          projectDoc.data != null &&
          SFProjectService.hasDraft(projectDoc.data) &&
          this.permissionsService.canAccessDrafts(projectDoc, this.userService.currentUserId) &&
          latestDraftBuild !== 'loading' &&
          latestDraftBuild !== null &&
          !this.draftOptionsService.areFormattingOptionsAvailableButUnselected(latestDraftBuild);
        const items: Observable<TabMenuItem>[] = [];

        for (const tabType of editorTabTypes) {
          switch (tabType) {
            case 'biblical-terms':
              if (!this.canShowBiblicalTerms(projectDoc)) {
                continue;
              }
              break;
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

        return items.length > 0 ? combineLatest(items) : of([]);
      }),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

  private createMenuItem(tabType: EditorTabType): Observable<TabMenuItem> {
    switch (tabType) {
      case 'biblical-terms':
        return this.i18n.translate('editor_tabs_menu.biblical_terms_menu_item').pipe(
          map(localizedMenuItemText => ({
            type: 'biblical-terms',
            svgIcon: 'biblical_terms',
            text: localizedMenuItemText
          }))
        );
      case 'history':
        return this.i18n.translate('editor_tabs_menu.history_menu_item').pipe(
          map(localizedMenuItemText => ({
            type: 'history',
            icon: 'history',
            text: localizedMenuItemText
          }))
        );
      case 'draft':
        return this.i18n.translate('editor_tabs_menu.draft_menu_item').pipe(
          map(localizedMenuItemText => ({
            type: 'draft',
            icon: 'auto_awesome',
            text: localizedMenuItemText
          }))
        );
      case 'project-resource':
        return this.i18n.translate('editor_tabs_menu.project_resource_menu_item').pipe(
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

  private canShowBiblicalTerms(projectDoc: SFProjectProfileDoc): boolean {
    return this.permissionsService.canAccessBiblicalTerms(projectDoc);
  }

  private canShowHistory(projectDoc: SFProjectProfileDoc): boolean {
    if (projectDoc.data == null) return false;
    if (ParatextService.isResource(projectDoc.data.paratextId)) return false;
    // The user must be a Paratext user. No specific edit permission for the chapter is required.
    return isParatextRole(projectDoc.data.userRoles[this.userService.currentUserId]);
  }

  private canShowResource(projectDoc: SFProjectProfileDoc): boolean {
    return this.permissionsService.canSync(projectDoc, this.userService.currentUserId);
  }
}
