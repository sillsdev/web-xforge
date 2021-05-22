import { MdcDialog } from '@angular-mdc/web/dialog';
import { Component, Input, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CheckingShareLevel } from 'realtime-server/lib/esm/scriptureforge/models/checking-config';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { map } from 'rxjs/operators';
import { UserService } from 'xforge-common/user.service';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { ShareDialogComponent, ShareDialogData } from './share-dialog.component';

@Component({
  selector: 'app-share',
  templateUrl: './share.component.html',
  styleUrls: ['./share.component.scss']
})
export class ShareComponent implements OnInit {
  @Input() readonly defaultRole?: SFProjectRole;

  private projectDoc?: SFProjectDoc;
  private projectId?: string;

  constructor(
    private readonly dialog: MdcDialog,
    private readonly projectService: SFProjectService,
    private readonly activatedRoute: ActivatedRoute,
    private readonly userService: UserService
  ) {}

  get isSharingEnabled(): boolean {
    if (this.projectDoc != null && this.projectDoc.data != null) {
      return (
        this.projectDoc.data.checkingConfig.shareEnabled ||
        this.projectDoc.data.userRoles[this.userService.currentUserId] === SFProjectRole.ParatextAdministrator
      );
    }
    return false;
  }

  private get isLinkSharingEnabled(): boolean {
    return (
      this.projectDoc?.data?.checkingConfig.shareLevel === CheckingShareLevel.Anyone &&
      this.projectDoc?.data?.checkingConfig.shareEnabled === true
    );
  }

  ngOnInit(): void {
    this.activatedRoute.params.pipe(map(params => params['projectId'] as string)).subscribe(async projectId => {
      this.projectId = projectId;
      this.projectDoc = await this.projectService.get(projectId);
    });
  }

  openDialog() {
    this.dialog.open(ShareDialogComponent, {
      data: {
        projectId: this.projectId,
        isLinkSharingEnabled: this.isLinkSharingEnabled,
        defaultRole: this.defaultRole
      } as ShareDialogData
    });
  }
}
