import { Component, EventEmitter, Output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Canon } from '@sillsdev/scripture';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { BehaviorSubject, combineLatest, Observable, of } from 'rxjs';
import { delay, map, startWith, switchMap } from 'rxjs/operators';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { I18nService } from 'xforge-common/i18n.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { UserService } from 'xforge-common/user.service';
import { getQuietDestroyRef } from 'xforge-common/utils';
import { ResumeCheckingService } from '../checking/checking/resume-checking.service';
import { SFProjectProfileDoc } from '../core/models/sf-project-profile-doc';
import { roleCanAccessCommunityChecking, roleCanAccessTranslate } from '../core/models/sf-project-role-info';
import { SFProjectUserConfigDoc } from '../core/models/sf-project-user-config-doc';
import { SFProjectService } from '../core/sf-project.service';
import { NmtDraftAuthGuard, SettingsAuthGuard, SyncAuthGuard, UsersAuthGuard } from '../shared/project-router.guard';

@Component({
  selector: 'app-navigation',
  templateUrl: './navigation.component.html',
  styleUrls: ['./navigation.component.scss']
})
export class NavigationComponent {
  canSeeSettings$: Observable<boolean> = this.activatedProjectService.projectId$.pipe(
    switchMap(projectId => (projectId == null ? of(false) : this.settingsAuthGuard.allowTransition(projectId)))
  );
  canSeeUsers$: Observable<boolean> = this.activatedProjectService.projectId$.pipe(
    switchMap(projectId => (projectId == null ? of(false) : this.usersAuthGuard.allowTransition(projectId)))
  );
  canSync$: Observable<boolean> = this.activatedProjectService.projectId$.pipe(
    switchMap(projectId => (projectId == null ? of(false) : this.syncAuthGuard.allowTransition(projectId)))
  );
  /** Whether the user can see at least one of settings, users, or sync page */
  canSeeAdminPages$: Observable<boolean> = combineLatest([this.canSeeSettings$, this.canSeeUsers$, this.canSync$]).pipe(
    map(([settings, users, sync]) => settings || users || sync)
  );
  canGenerateDraft$: Observable<boolean> = this.activatedProjectService.projectId$.pipe(
    switchMap(projectId => (projectId == null ? of(false) : this.nmtDraftAuthGuard.allowTransition(projectId)))
  );

  projectUserConfigDoc?: SFProjectUserConfigDoc;
  answerQuestionsLink$: Observable<string[] | undefined> = this.resumeCheckingService.checkingLink$;

  @Output() menuItemClicked = new EventEmitter<void>();

  projectUserConfigDoc$ = new BehaviorSubject<SFProjectUserConfigDoc | undefined>(undefined);

  translateLink$ = combineLatest([
    this.activatedProjectService.changes$,
    this.projectUserConfigDoc$.pipe(
      switchMap(doc => doc?.changes$.pipe(startWith(undefined)) ?? of(undefined)),
      map(() => this.projectUserConfigDoc$.getValue())
    )
  ]).pipe(
    map(([projectDoc, projectUserConfigDoc]) => {
      const project = projectDoc?.data;
      const config = projectUserConfigDoc?.data;

      const bookNum = config?.selectedBookNum ?? project?.texts[0]?.bookNum ?? Canon.firstBook;
      const chapterNum = config?.selectedChapterNum ?? project?.texts[bookNum]?.chapters[0].number ?? 1;
      const bookId = Canon.bookNumberToId(bookNum);

      return this.getProjectLink('translate', [bookId, String(chapterNum)]);
    }),
    // The selected book and chapter is updated by CheckingQuestionsComponent in the middle of a change detection cycle.
    // This causes the link to the translate page to cause ExpressionChangedAfterItHasBeenCheckedError. To avoid this,
    // delay the link update until the next change detection cycle.
    delay(0)
  );

  private destroyRef = getQuietDestroyRef();

  constructor(
    readonly i18n: I18nService,
    private readonly nmtDraftAuthGuard: NmtDraftAuthGuard,
    private readonly settingsAuthGuard: SettingsAuthGuard,
    private readonly syncAuthGuard: SyncAuthGuard,
    private readonly usersAuthGuard: UsersAuthGuard,
    private readonly onlineStatusService: OnlineStatusService,
    private readonly projectService: SFProjectService,
    private readonly userService: UserService,
    private readonly resumeCheckingService: ResumeCheckingService,
    private readonly router: Router,
    private readonly activatedProjectService: ActivatedProjectService,
    readonly featureFlags: FeatureFlagService
  ) {
    this.activatedProjectService.projectId$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(projectId => {
      this.updateProjectUserConfig(projectId);
    });
  }

  get selectedProjectDoc(): SFProjectProfileDoc | undefined {
    return this.activatedProjectService.projectDoc;
  }

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
    return this.selectedProjectRole != null && roleCanAccessCommunityChecking(this.selectedProjectRole);
  }

  get isTranslateEnabled(): boolean {
    return roleCanAccessTranslate(this.selectedProjectRole);
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
    return this.userHasPermission(SFProjectDomain.Questions, Operation.Edit);
  }

  clickWithinNavList($event: MouseEvent): void {
    let element = $event.target as HTMLElement;
    while (element != null) {
      if (element.tagName === 'A' && element.classList.contains('mdc-list-item')) {
        this.menuItemClicked.emit();
        return;
      } else if (element.parentElement != null) {
        element = element.parentElement;
      } else {
        return;
      }
    }
  }

  getProjectLink(
    page: 'translate' | 'draft-generation' | 'checking' | 'sync' | 'users' | 'settings',
    subPages: string[] = []
  ): string[] {
    if (this.selectedProjectId == null) {
      return [];
    }
    return ['/projects', this.selectedProjectId, page, ...subPages];
  }

  get draftGenerationLink(): string[] {
    return this.getProjectLink('draft-generation');
  }

  // draftReviewActive, answerQuestionsActive, draftGenerationActive are needed because appRouterLink only highlights
  // the link if the url matches exactly. These modes do not match to a single url, so appRouterLink does not mark them
  // active.

  get draftReviewActive(): boolean {
    return this.urlStartsWithAndHasAnotherPortion(this.getProjectLink('translate').join('/'));
  }

  get answerQuestionsActive(): boolean {
    return this.urlStartsWithAndHasAnotherPortion(this.getProjectLink('checking').join('/'));
  }

  get draftGenerationActive(): boolean {
    return this.router.url.startsWith(this.getProjectLink('draft-generation').join('/'));
  }

  private urlStartsWithAndHasAnotherPortion(link: string): boolean {
    // add 1 to link length to account for the slash
    return this.router.url.startsWith(link) && this.router.url.length > link.length + 1;
  }

  private async updateProjectUserConfig(projectId: string | undefined): Promise<void> {
    this.projectUserConfigDoc = undefined;
    if (projectId != null) {
      this.projectUserConfigDoc = await this.projectService.getUserConfig(projectId, this.userService.currentUserId);
      this.projectUserConfigDoc$.next(this.projectUserConfigDoc);
    }
  }

  private userHasPermission(projectDomain: string, operation: Operation): boolean {
    const project = this.selectedProjectDoc?.data;
    const userId = this.userService.currentUserId;
    return project != null && SF_PROJECT_RIGHTS.hasRight(project, userId, projectDomain, operation);
  }
}
