import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Canon } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/canon';
import { combineLatest, Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { I18nService } from 'xforge-common/i18n.service';
import { PwaService } from 'xforge-common/pwa.service';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from '../core/models/sf-project-profile-doc';
import { SFProjectUserConfigDoc } from '../core/models/sf-project-user-config-doc';
import { SFProjectService } from '../core/sf-project.service';
import { SettingsAuthGuard, SyncAuthGuard, UsersAuthGuard } from '../shared/project-router.guard';

@Component({
  selector: 'app-navigation',
  templateUrl: './navigation.component.html',
  styleUrls: ['./navigation.component.scss']
})
export class NavigationComponent {
  isTranslateEnabled = true;
  hasSingleAppEnabled = true;
  translateVisible = true;
  isCheckingEnabled = true;
  showAllQuestions = true;

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
    readonly flags: FeatureFlagService,
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
