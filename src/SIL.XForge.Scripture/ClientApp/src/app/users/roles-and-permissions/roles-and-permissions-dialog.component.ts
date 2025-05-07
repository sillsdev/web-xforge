import { Component, DestroyRef, Inject, OnInit } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { UserProfile } from 'realtime-server/lib/esm/common/models/user';
import { SFProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { isParatextRole, SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { ExternalUrlService } from 'xforge-common/external-url.service';
import { I18nService } from 'xforge-common/i18n.service';
import { DocSubscription } from 'xforge-common/models/realtime-doc';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { SFProjectService } from '../../core/sf-project.service';

export interface UserData {
  projectId: string;
  userId: string;
  userProfile: UserProfile;
}

@Component({
  selector: 'app-roles-and-permissions',
  templateUrl: './roles-and-permissions-dialog.component.html',
  styleUrls: ['./roles-and-permissions-dialog.component.scss']
})
export class RolesAndPermissionsDialogComponent implements OnInit {
  readonly roles: FormControl<any> = new FormControl<string>('');
  readonly canAddEditQuestions = new FormControl(false);
  readonly canManageAudio = new FormControl(false);

  readonly form = new FormGroup({
    roles: this.roles,
    canAddEditQuestions: this.canAddEditQuestions,
    canManageAudio: this.canManageAudio
  });

  private projectDoc?: SFProjectDoc;

  constructor(
    @Inject(MAT_DIALOG_DATA) public readonly data: UserData,
    public readonly urls: ExternalUrlService,
    public readonly i18n: I18nService,
    private readonly onlineService: OnlineStatusService,
    private readonly projectService: SFProjectService,
    private readonly destroyRef: DestroyRef
  ) {}

  async ngOnInit(): Promise<void> {
    this.onlineService.onlineStatus$.subscribe(isOnline => {
      isOnline ? this.form.enable() : this.form.disable();
    });

    this.projectDoc = await this.projectService.get(
      this.data.projectId,
      new DocSubscription('RolesAndPermissionsDialogComponent', this.destroyRef)
    );
    const project: Readonly<SFProject | undefined> = this.projectDoc.data;

    if (project === undefined) {
      this.form.disable();
      return;
    }

    this.roles.setValue(project.userRoles[this.data.userId]);

    const canAddEditQuestions: boolean =
      SF_PROJECT_RIGHTS.hasRight(project, this.data.userId, SFProjectDomain.Questions, Operation.Create) &&
      SF_PROJECT_RIGHTS.hasRight(project, this.data.userId, SFProjectDomain.Questions, Operation.Edit);
    this.canAddEditQuestions.setValue(canAddEditQuestions);

    const canManageAudio: boolean =
      SF_PROJECT_RIGHTS.hasRight(project, this.data.userId, SFProjectDomain.TextAudio, Operation.Create) &&
      SF_PROJECT_RIGHTS.hasRight(project, this.data.userId, SFProjectDomain.TextAudio, Operation.Edit) &&
      SF_PROJECT_RIGHTS.hasRight(project, this.data.userId, SFProjectDomain.TextAudio, Operation.Delete);
    this.canManageAudio.setValue(canManageAudio);

    if (this.isParatextUser()) {
      this.roles.disable();
    }
  }

  isParatextUser(): boolean {
    return this.projectDoc?.data !== undefined
      ? isParatextRole(this.projectDoc.data.userRoles[this.data.userId])
      : false;
  }

  async save(): Promise<void> {
    if (this.form.disabled) return;

    const selectedRole = this.roles.value;
    await this.projectService.onlineUpdateUserRole(this.data.projectId, this.data.userId, selectedRole);
    this.projectDoc = await this.projectService.get(
      this.data.projectId,
      new DocSubscription('RolesAndPermissionsDialogComponent', this.destroyRef)
    );

    const permissions = new Set((this.projectDoc?.data?.userPermissions ?? {})[this.data.userId] ?? []);

    [
      SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.Questions, Operation.Create),
      SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.Questions, Operation.Edit)
    ].forEach(right => (this.canAddEditQuestions.value ? permissions.add(right) : permissions.delete(right)));
    [
      SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.TextAudio, Operation.Create),
      SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.TextAudio, Operation.Edit),
      SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.TextAudio, Operation.Delete)
    ].forEach(right => (this.canManageAudio.value ? permissions.add(right) : permissions.delete(right)));

    await this.projectService.onlineSetUserProjectPermissions(
      this.data.projectId,
      this.data.userId,
      Array.from(permissions)
    );
  }

  get roleOptions(): string[] {
    if (this.isParatextUser()) {
      return Object.values(SFProjectRole).filter(r => isParatextRole(r));
    } else {
      const scriptureForgeRoles = Object.values(SFProjectRole).filter(r => !isParatextRole(r));
      return scriptureForgeRoles.filter(r => r !== SFProjectRole.None);
    }
  }
}
