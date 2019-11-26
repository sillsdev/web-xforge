import { MdcDialog } from '@angular-mdc/web/dialog';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CheckingShareLevel } from 'realtime-server/lib/scriptureforge/models/checking-config';
import { SFProjectRole } from 'realtime-server/lib/scriptureforge/models/sf-project-role';
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

  private get shareLevel(): CheckingShareLevel {
    if (this.projectDoc != null && this.projectDoc.data != null) {
      return this.projectDoc.data.checkingConfig.shareLevel;
    }
    return CheckingShareLevel.Specific;
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
        isLinkSharingEnabled: this.shareLevel === CheckingShareLevel.Anyone
      } as ShareDialogData
    });
  }
}
