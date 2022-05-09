import { Component, Input, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute } from '@angular/router';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { map } from 'rxjs/operators';
import { ShareDialogComponent, ShareDialogData } from './share-dialog.component';

@Component({
  selector: 'app-share',
  templateUrl: './share.component.html',
  styleUrls: ['./share.component.scss']
})
export class ShareComponent implements OnInit {
  @Input() defaultRole?: SFProjectRole;

  private projectId?: string;

  constructor(private readonly dialog: MatDialog, private readonly activatedRoute: ActivatedRoute) {}

  ngOnInit(): void {
    this.activatedRoute.params.pipe(map(params => params['projectId'] as string)).subscribe(async projectId => {
      this.projectId = projectId;
    });
  }

  openDialog() {
    this.dialog.open(ShareDialogComponent, {
      data: {
        projectId: this.projectId,
        defaultRole: this.defaultRole
      } as ShareDialogData
    });
  }
}
