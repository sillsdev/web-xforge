import { MdcDialog } from '@angular-mdc/web';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SharingLevel } from 'realtime-server/lib/common/models/sharing-level';
import { map } from 'rxjs/operators';
import { ProjectService } from '../project.service';
import { ShareDialogComponent, ShareDialogData } from './share-dialog.component';

@Component({
  selector: 'app-share',
  templateUrl: './share.component.html',
  styleUrls: ['./share.component.scss']
})
export class ShareComponent implements OnInit {
  private projectId: string;
  private shareEnabled: boolean;
  private shareLevel: SharingLevel;

  constructor(
    private readonly dialog: MdcDialog,
    private readonly projectService: ProjectService,
    private readonly activatedRoute: ActivatedRoute
  ) {}

  get isSharingEnabled(): boolean {
    return this.shareEnabled;
  }

  ngOnInit(): void {
    this.activatedRoute.params.pipe(map(params => params['projectId'] as string)).subscribe(async projectId => {
      this.projectId = projectId;
      const projectDoc = await this.projectService.get(projectId);
      this.shareEnabled = projectDoc.data.shareEnabled;
      this.shareLevel = projectDoc.data.shareLevel;
    });
  }

  openDialog() {
    this.dialog.open(ShareDialogComponent, {
      data: {
        projectId: this.projectId,
        isLinkSharingEnabled: this.shareLevel === SharingLevel.Anyone
      } as ShareDialogData
    });
  }
}
