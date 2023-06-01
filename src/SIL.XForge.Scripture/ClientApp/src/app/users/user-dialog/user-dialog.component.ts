import { Component, Inject } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { UserProfile } from 'realtime-server/lib/esm/common/models/user';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { UserService } from 'xforge-common/user.service';

export interface UserDialogData {
  userInfo: UserProfile;
  isParatextUser: boolean;
  role: string;
}

@Component({
  templateUrl: './user-dialog.component.html',
  styleUrls: ['./user-dialog.component.scss']
})
export class UserDialogComponent {
  roleControl: FormControl;
  formGroup: FormGroup;

  private paratextRoles: SFProjectRole[] = [
    SFProjectRole.ParatextAdministrator,
    SFProjectRole.ParatextTranslator,
    SFProjectRole.ParatextConsultant,
    SFProjectRole.ParatextObserver
  ];
  private sfRoles = [SFProjectRole.Commenter, SFProjectRole.CommunityChecker, SFProjectRole.Viewer];
  constructor(
    readonly dialogRef: MatDialogRef<UserDialogComponent, string>,
    @Inject(MAT_DIALOG_DATA) readonly data: UserDialogData,
    private readonly userService: UserService
  ) {
    this.roleControl = new FormControl(this.data.role);
    this.formGroup = new FormGroup({ roleControl: this.roleControl });
  }

  get applicableRoles(): string[] {
    if (this.data.isParatextUser) {
      return this.paratextRoles;
    }
    return this.sfRoles;
  }

  saveRole(): void {
    this.dialogRef.close(this.roleControl.value);
  }
}
