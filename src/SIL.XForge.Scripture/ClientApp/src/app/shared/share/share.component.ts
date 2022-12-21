import { Component, Input, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { map } from 'rxjs/operators';
import { DialogService } from 'xforge-common/dialog.service';
import { ShareDialogComponent, ShareDialogData } from './share-dialog.component';

@Component({
  selector: 'app-share',
  templateUrl: './share.component.html',
  styleUrls: ['./share.component.scss']
})
export class ShareComponent implements OnInit {
  @Input() defaultRole?: SFProjectRole;
  @Input() iconOnlyButton: boolean = true;

  private projectId?: string;

  constructor(private readonly dialogService: DialogService, private readonly activatedRoute: ActivatedRoute) {}

  ngOnInit(): void {
    this.activatedRoute.params.pipe(map(params => params['projectId'] as string)).subscribe(async projectId => {
      this.projectId = projectId;
    });
  }

  openDialog() {
    this.dialogService.openMatDialog(ShareDialogComponent, {
      width: '480px',
      data: {
        projectId: this.projectId,
        defaultRole: this.defaultRole
      } as ShareDialogData
    });
  }
}
