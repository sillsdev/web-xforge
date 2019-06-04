import { MdcDialog } from '@angular-mdc/web';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { filter, map, switchMap } from 'rxjs/operators';
import { ShareConfig, ShareLevel } from '../models/share-config';
import { ProjectService } from '../project.service';
import { ShareDialogComponent, ShareDialogData } from './share-dialog.component';

@Component({
  selector: 'app-share',
  templateUrl: './share.component.html',
  styleUrls: ['./share.component.scss']
})
export class ShareComponent implements OnInit {
  private projectId: string;
  private shareConfig: ShareConfig;

  constructor(
    private readonly dialog: MdcDialog,
    private readonly projectService: ProjectService,
    private readonly activatedRoute: ActivatedRoute
  ) {}

  get isSharingEnabled(): boolean {
    return this.shareConfig != null && this.shareConfig.enabled;
  }

  ngOnInit(): void {
    this.activatedRoute.params
      .pipe(
        map(params => params['projectId'] as string),
        filter(projectId => projectId != null),
        switchMap(projectId =>
          this.projectService.getShareConfig(projectId).pipe(map(shareConfig => ({ projectId, shareConfig })))
        )
      )
      .subscribe(results => {
        this.projectId = results.projectId;
        this.shareConfig = results.shareConfig;
      });
  }

  openDialog() {
    this.dialog.open(ShareDialogComponent, {
      data: {
        projectId: this.projectId,
        isLinkSharingEnabled: this.shareConfig.level === ShareLevel.Anyone
      } as ShareDialogData
    });
  }
}
