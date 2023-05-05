import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { SFProjectDomain, SF_PROJECT_RIGHTS } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { Canon } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/canon';
import { combineLatest, Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { I18nService } from 'xforge-common/i18n.service';
import { PwaService } from 'xforge-common/pwa.service';
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
    private readonly pwaService: PwaService,
    private readonly projectService: SFProjectService,
    private readonly userService: UserService
  ) {}

  get isAppOnline(): boolean {
    return this.pwaService.isOnline;
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

  get canManageQuestions(): boolean {
    const project = this.selectedProjectDoc?.data;
    const userId = this.userService.currentUserId;
    return project != null && SF_PROJECT_RIGHTS.hasRight(project, userId, SFProjectDomain.Questions, Operation.Edit);
  }

  getRouterLink(tool: string, extension?: string): string[] {
    if (this.selectedProjectId == null) {
      return [];
    }
    const link = ['/projects', this.selectedProjectId, tool];
    if (extension != null && extension !== '') {
      link.push(extension);
    }
    return link;
  }

  getTranslateLink(): string[] {
    const config = this.projectUserConfigDoc?.data;
    if (config == null) return ['/projects'];
    const bookNum = config.selectedBookNum ?? this.selectedProjectDoc?.data?.texts[0]?.bookNum;
    if (bookNum == null) return ['/projects', config.projectRef, 'translate'];
    const book = Canon.bookNumberToId(bookNum);
    return ['/projects', config.projectRef, 'translate', book];
  }

  itemSelected(): void {
    this.menuItemClicked.emit();
  }

  private async updateProjectUserConfig(projectId: string | undefined): Promise<void> {
    this.projectUserConfigDoc = undefined;
    if (projectId != null) {
      this.projectUserConfigDoc = await this.projectService.getUserConfig(projectId, this.userService.currentUserId);
    }
  }
}
