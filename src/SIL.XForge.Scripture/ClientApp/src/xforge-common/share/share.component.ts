import { MdcDialog } from '@angular-mdc/web';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { filter, map, switchMap } from 'rxjs/operators';
import { SharingLevel } from '../models/sharing-level';
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
    this.activatedRoute.params
      .pipe(
        map(params => params['projectId'] as string),
        filter(projectId => projectId != null),
        switchMap(projectId => this.projectService.get(projectId))
      )
      .subscribe(results => {
        this.projectId = results.data.id;
        this.shareEnabled = results.data.shareEnabled;
        this.shareLevel = results.data.shareLevel;
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
