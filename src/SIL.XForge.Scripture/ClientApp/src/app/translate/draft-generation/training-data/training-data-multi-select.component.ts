import { CommonModule } from '@angular/common';
import { Component, DestroyRef, EventEmitter, Input, OnChanges, OnInit, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialogConfig } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule } from '@ngneat/transloco';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { TrainingData } from 'realtime-server/lib/esm/scriptureforge/models/training-data';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nService } from 'xforge-common/i18n.service';
import { UserService } from 'xforge-common/user.service';
import { quietTakeUntilDestroyed } from 'xforge-common/utils';
import { SharedModule } from '../../../shared/shared.module';
import {
  TrainingDataUploadDialogComponent,
  TrainingDataUploadDialogData
} from './training-data-upload-dialog.component';
import { TrainingDataService } from './training-data.service';

export interface TrainingDataOption {
  value: TrainingData;
  selected: boolean;
}

@Component({
  selector: 'app-training-data-multi-select',
  templateUrl: './training-data-multi-select.component.html',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatChipsModule, MatIconModule, SharedModule, TranslocoModule],
  styleUrls: ['./training-data-multi-select.component.scss']
})
export class TrainingDataMultiSelectComponent implements OnChanges, OnInit {
  @Input() availableTrainingData: TrainingData[] = [];
  @Input() selectedTrainingDataIds: string[] = [];
  @Output() trainingDataSelect = new EventEmitter<string[]>();

  sourceLanguage?: string;
  targetLanguage?: string;
  trainingDataOptions: TrainingDataOption[] = [];
  constructor(
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly dialogService: DialogService,
    private readonly i18n: I18nService,
    private readonly trainingDataService: TrainingDataService,
    private readonly userService: UserService,
    private destroyRef: DestroyRef
  ) {}

  ngOnInit(): void {
    this.i18n.locale$.pipe(quietTakeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.sourceLanguage = this.getLanguageDisplayName('source');
      this.targetLanguage = this.getLanguageDisplayName('target');
    });
  }

  ngOnChanges(): void {
    this.initTrainingDataOptions();
  }

  private getLanguageDisplayName(project: 'source' | 'target'): string | undefined {
    const projectDoc: SFProjectProfile | undefined = this.activatedProjectService.projectDoc?.data;
    if (projectDoc == null) {
      return undefined;
    } else if (project === 'source') {
      return this.i18n.getLanguageDisplayName(projectDoc.translateConfig.source?.writingSystem.tag);
    } else {
      return this.i18n.getLanguageDisplayName(projectDoc.writingSystem.tag);
    }
  }

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
    await this.trainingDataService.deleteTrainingDataAsync(trainingData);
  }

  onChipListChange(data: TrainingDataOption): void {
    const dataIndex: number = this.trainingDataOptions.findIndex(n => n.value.dataId === data.value.dataId);
    this.trainingDataOptions[dataIndex].selected = !this.trainingDataOptions[dataIndex].selected;
    this.selectedTrainingDataIds = this.trainingDataOptions.filter(n => n.selected).map(n => n.value.dataId);
    this.trainingDataSelect.emit(this.selectedTrainingDataIds);
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
      this.trainingDataSelect.emit([...this.selectedTrainingDataIds, result.dataId]);
    });
  }

  private initTrainingDataOptions(): void {
    this.trainingDataOptions = this.availableTrainingData.map((item: TrainingData) => ({
      value: item,
      selected: this.selectedTrainingDataIds.includes(item.dataId)
    }));
  }
}
