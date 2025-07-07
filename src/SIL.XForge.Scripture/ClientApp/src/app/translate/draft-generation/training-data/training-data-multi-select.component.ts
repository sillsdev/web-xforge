import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogConfig } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { TranslocoModule } from '@ngneat/transloco';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { TrainingData } from 'realtime-server/lib/esm/scriptureforge/models/training-data';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DialogService } from 'xforge-common/dialog.service';
import { UserService } from 'xforge-common/user.service';
import { SharedModule } from '../../../shared/shared.module';
import {
  TrainingDataUploadDialogComponent,
  TrainingDataUploadDialogData
} from './training-data-upload-dialog.component';

@Component({
  selector: 'app-training-data-multi-select',
  templateUrl: './training-data-multi-select.component.html',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, SharedModule, TranslocoModule, MatListModule],
  styleUrls: ['./training-data-multi-select.component.scss']
})
export class TrainingDataMultiSelectComponent {
  @Input() availableTrainingData: TrainingData[] = [];
  @Output() trainingDataSelect = new EventEmitter<TrainingData[]>();

  constructor(
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly dialogService: DialogService,
    private readonly userService: UserService
  ) {}

  canDeleteTrainingData(trainingData: TrainingData): boolean {
    const userId: string = this.userService.currentUserId;
    const project: SFProjectProfile | undefined = this.activatedProjectService.projectDoc?.data;
    return (
      project != null &&
      SF_PROJECT_RIGHTS.hasRight(project, userId, SFProjectDomain.TrainingData, Operation.Delete, trainingData)
    );
  }

  async deleteTrainingData(trainingData: TrainingData): Promise<void> {
    const confirmation = await this.dialogService.confirm(
      'training_data_multi_select.confirm_delete',
      'training_data_multi_select.delete'
    );
    if (!confirmation) return;

    this.trainingDataSelect.emit([...this.availableTrainingData.filter(td => td !== trainingData)]);
  }

  openUploadDialog(): void {
    if (this.activatedProjectService.projectId == null) return;
    const dialogConfig: MatDialogConfig<TrainingDataUploadDialogData> = {
      data: { projectId: this.activatedProjectService.projectId, availableTrainingData: this.availableTrainingData },
      width: '320px'
    };
    const dialogRef = this.dialogService.openMatDialog(TrainingDataUploadDialogComponent, dialogConfig);
    dialogRef.afterClosed().subscribe(result => {
      if (result == null || result === 'close') {
        return;
      }

      // Emit the selection event
      this.trainingDataSelect.emit([...this.availableTrainingData, result]);
    });
  }
}
