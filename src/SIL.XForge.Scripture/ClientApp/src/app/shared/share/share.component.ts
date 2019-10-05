import { MdcDialog } from '@angular-mdc/web';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CheckingShareLevel } from 'realtime-server/lib/scriptureforge/models/checking-config';
import { map } from 'rxjs/operators';
import { SFProjectService } from '../../core/sf-project.service';
import { ShareDialogComponent, ShareDialogData } from './share-dialog.component';

@Component({
  selector: 'app-share',
  templateUrl: './share.component.html',
  styleUrls: ['./share.component.scss']
})
export class ShareComponent implements OnInit {
  private projectId?: string;
  private shareEnabled: boolean = false;
  private shareLevel: CheckingShareLevel = CheckingShareLevel.Specific;

  constructor(
    private readonly dialog: MdcDialog,
    private readonly projectService: SFProjectService,
    private readonly activatedRoute: ActivatedRoute
  ) {}

  get isSharingEnabled(): boolean {
    return this.shareEnabled;
  }

  ngOnInit(): void {
    this.activatedRoute.params.pipe(map(params => params['projectId'] as string)).subscribe(async projectId => {
      this.projectId = projectId;
      const projectDoc = await this.projectService.get(projectId);
      if (projectDoc.data != null) {
        this.shareEnabled = projectDoc.data.checkingConfig.shareEnabled;
        this.shareLevel = projectDoc.data.checkingConfig.shareLevel;
      }
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
