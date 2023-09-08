import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Router } from '@angular/router';
import { Canon } from '@sillsdev/scripture';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { SFProjectDomain, SF_PROJECT_RIGHTS } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { combineLatest, Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { I18nService } from 'xforge-common/i18n.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from '../core/models/sf-project-profile-doc';
import { canAccessCommunityCheckingApp, canAccessTranslateApp } from '../core/models/sf-project-role-info';
import { SFProjectUserConfigDoc } from '../core/models/sf-project-user-config-doc';
import { SFProjectService } from '../core/sf-project.service';
import { SettingsAuthGuard, SyncAuthGuard, UsersAuthGuard } from '../shared/project-router.guard';

@Component({
  selector: 'app-navigation',
  templateUrl: './navigation.component.html',
  styleUrls: ['./navigation.component.scss']
})
export class NavigationComponent {
  projectDocs?: SFProjectProfileDoc[];
  canSeeSettings$?: Observable<boolean>;
  canSeeUsers$?: Observable<boolean>;
  canSync$?: Observable<boolean>;
  /** Whether the user can see at least one of settings, users, or sync page */
  canSeeAdminPages$?: Observable<boolean>;

  projectUserConfigDoc?: SFProjectUserConfigDoc;

  @Input() set selectedProjectDoc(selectedProjectDoc: SFProjectProfileDoc | undefined) {
    this._selectedProjectDoc = selectedProjectDoc;

    const projectId = selectedProjectDoc == null ? undefined : selectedProjectDoc.id;

    this.canSeeSettings$ = projectId == null ? of(false) : this.settingsAuthGuard.allowTransition(projectId);
    this.canSeeUsers$ = projectId == null ? of(false) : this.usersAuthGuard.allowTransition(projectId);
    this.canSync$ = projectId == null ? of(false) : this.syncAuthGuard.allowTransition(projectId);
    this.canSeeAdminPages$ = combineLatest([this.canSeeSettings$, this.canSeeUsers$, this.canSync$]).pipe(
      map(([settings, users, sync]) => settings || users || sync)
    );

    this.updateProjectUserConfig(projectId);
  }

  get selectedProjectDoc(): SFProjectProfileDoc | undefined {
    return this._selectedProjectDoc;
  }

  private _selectedProjectDoc?: SFProjectProfileDoc;

  @Output() menuItemClicked = new EventEmitter<void>();

  constructor(
    readonly i18n: I18nService,
    private readonly settingsAuthGuard: SettingsAuthGuard,
    private readonly syncAuthGuard: SyncAuthGuard,
    private readonly usersAuthGuard: UsersAuthGuard,
    private readonly onlineStatusService: OnlineStatusService,
    private readonly projectService: SFProjectService,
    private readonly userService: UserService,
    private readonly router: Router,
    readonly featureFlags: FeatureFlagService
  ) {}

  get isAppOnline(): boolean {
    return this.onlineStatusService.isOnline;
  }

  get lastSyncFailed(): boolean {
    return this.selectedProjectDoc?.data?.sync.lastSyncSuccessful === false;
  }

  get syncInProgress(): boolean {
    return this.selectedProjectDoc?.data != null && this.selectedProjectDoc.data.sync.queuedCount > 0;
  }

  get selectedProjectId(): string | undefined {
    return this.selectedProjectDoc == null ? undefined : this.selectedProjectDoc.id;
  }

  get isCheckingEnabled(): boolean {
    return (
      this.selectedProjectDoc?.data?.checkingConfig.checkingEnabled === true && this.hasCommunityCheckingPermission
    );
  }

  get hasCommunityCheckingPermission(): boolean {
    return this.selectedProjectRole != null && canAccessCommunityCheckingApp(this.selectedProjectRole);
  }

  get isTranslateEnabled(): boolean {
    return canAccessTranslateApp(this.selectedProjectRole);
  }

  get selectedProjectRole(): SFProjectRole | undefined {
    return this.currentUserId == null
      ? undefined
      : (this.selectedProjectDoc?.data?.userRoles?.[this.currentUserId] as SFProjectRole);
  }

  get currentUserId(): string | undefined {
    return this.userService.currentUserId;
  }

  get canGenerateDraft(): boolean {
    return this.featureFlags.showNmtDrafting.enabled && this.userHasPermission(SFProjectDomain.Texts, Operation.Edit);
  }

  get canManageQuestions(): boolean {
    return this.userHasPermission(SFProjectDomain.Questions, Operation.Edit);
  }

  clickWithinNavList($event: MouseEvent): void {
    let element = $event.target as HTMLElement;
    while (element != null) {
      if (element.tagName === 'A' && element.classList.contains('mat-list-item')) {
        this.menuItemClicked.emit();
        return;
      } else if (element.parentElement != null) {
        element = element.parentElement;
      } else {
        return;
      }
    }
  }

  get defaultBookId(): string {
    // TODO get latest book and chapter the user has viewed
    const bookNum: number | undefined = this.selectedProjectDoc?.data?.texts[0]?.bookNum;
    return bookNum == null ? 'GEN' : Canon.bookNumberToId(bookNum);
  }

  getProjectLink(
    page: 'translate' | 'draft-generation' | 'checking' | 'sync' | 'users' | 'settings',
    subPage?: string
  ): string[] {
    if (this.selectedProjectId == null) {
      return [];
    }
    return ['/projects', this.selectedProjectId, page, ...(subPage == null ? [] : [subPage])];
  }

  get draftReviewLink(): string[] {
    return this.getProjectLink('translate', this.defaultBookId);
  }

  get draftGenerationLink(): string[] {
    return this.getProjectLink('draft-generation');
  }

  get answerQuestionsLink(): string[] {
    return this.getProjectLink('checking', 'ALL');
  }

  // draftReviewActive and answerQuestionsActive are needed because appRouterLink only highlights the link if the url
  // matches exactly. These two modes do not match to a single url, so appRouterLink does not mark them active.

  get draftReviewActive(): boolean {
    return this.urlStartsWithAndHasAnotherPortion(this.getProjectLink('translate').join('/'));
  }

  get answerQuestionsActive(): boolean {
    return this.urlStartsWithAndHasAnotherPortion(this.getProjectLink('checking').join('/'));
  }

  private urlStartsWithAndHasAnotherPortion(link: string): boolean {
    // add 1 to link length to account for the slash
    return this.router.url.startsWith(link) && this.router.url.length > link.length + 1;
  }

  private async updateProjectUserConfig(projectId: string | undefined): Promise<void> {
    this.projectUserConfigDoc = undefined;
    if (projectId != null) {
      this.projectUserConfigDoc = await this.projectService.getUserConfig(projectId, this.userService.currentUserId);
    }
  }

  private userHasPermission(projectDomain: string, operation: Operation): boolean {
    const project = this.selectedProjectDoc?.data;
    const userId = this.userService.currentUserId;
    return project != null && SF_PROJECT_RIGHTS.hasRight(project, userId, projectDomain, operation);
  }
}
