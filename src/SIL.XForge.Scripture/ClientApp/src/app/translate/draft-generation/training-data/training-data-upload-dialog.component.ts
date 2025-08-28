import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, Inject, ViewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckbox, MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslocoModule } from '@ngneat/transloco';
import { TrainingData } from 'realtime-server/lib/esm/scriptureforge/models/training-data';
import { DialogService } from 'xforge-common/dialog.service';
import { FileService } from 'xforge-common/file.service';
import { I18nService } from 'xforge-common/i18n.service';
import { FileType } from 'xforge-common/models/file-offline-data';
import { UserService } from 'xforge-common/user.service';
import { objectId } from 'xforge-common/utils';
import { TrainingDataDoc } from '../../../core/models/training-data-doc';
import { SharedModule } from '../../../shared/shared.module';

export interface TrainingDataUploadDialogData {
  projectId: string;
  availableTrainingData: TrainingData[];
}

export interface TrainingDataFileUpload {
  url?: string;
  fileName?: string;
  blob?: Blob;
}

@Component({
    selector: 'app-training-data-upload-dialog',
    templateUrl: './training-data-upload-dialog.component.html',
    imports: [
        CommonModule,
        MatButtonModule,
        MatCheckboxModule,
        MatDialogModule,
        MatIconModule,
        MatProgressSpinnerModule,
        SharedModule,
        TranslocoModule
    ],
    styleUrls: ['./training-data-upload-dialog.component.scss']
})
export class TrainingDataUploadDialogComponent implements AfterViewInit {
  @ViewChild('dropzone') dropzone?: ElementRef<HTMLDivElement>;
  @ViewChild('fileDropzone') fileDropzone?: ElementRef<HTMLInputElement>;
  @ViewChild('skipFirstRow') skipFirstRow?: MatCheckbox;
  private _isUploading: boolean = false;
  private _showFilenameExists: boolean = false;
  private trainingDataFile?: TrainingDataFileUpload;

  constructor(
    readonly i18n: I18nService,
    @Inject(MAT_DIALOG_DATA) public data: TrainingDataUploadDialogData,
    private readonly dialogRef: MatDialogRef<TrainingDataUploadDialogComponent, TrainingData | undefined>,
    private readonly dialogService: DialogService,
    private readonly fileService: FileService,
    private readonly userService: UserService
  ) {}

  get hasBeenUploaded(): boolean {
    return this.trainingDataFile?.blob != null && this.trainingDataFile?.fileName != null;
  }

  get isUploading(): boolean {
    return this._isUploading;
  }

  get showFilenameExists(): boolean {
    return this._showFilenameExists;
  }

  get trainingDataFilename(): string {
    return this.trainingDataFile?.fileName ?? '';
  }

  updateTrainingData(trainingDataFile: TrainingDataFileUpload): void {
    this.trainingDataFile = trainingDataFile;
  }

  deleteTrainingData(): void {
    this._showFilenameExists = false;
    this.trainingDataFile = undefined;
    this.fileDropzone!.nativeElement.value = '';
  }

  ngAfterViewInit(): void {
    this.dropzone?.nativeElement.addEventListener('dragover', _ => {
      this.dropzone?.nativeElement.classList.add('dragover');
    });
    this.dropzone?.nativeElement.addEventListener('dragleave', _ => {
      this.dropzone?.nativeElement.classList.remove('dragover');
    });
    this.dropzone?.nativeElement.addEventListener('drop', (e: DragEvent) => {
      this.dropzone?.nativeElement.classList.remove('dragover');
      if (e?.dataTransfer?.files == null) {
        return;
      }
      this.processUploadedFiles(e.dataTransfer.files);
    });
  }

  async save(): Promise<void> {
    // We cannot save a file if it has not been uploaded, or if offline
    if (!this.hasBeenUploaded) {
      return;
    }

    this._isUploading = true;
    const dataId: string = objectId();
    const fileUrl: string | undefined = await this.fileService.onlineUploadFileOrFail(
      FileType.TrainingData,
      this.data.projectId,
      TrainingDataDoc.COLLECTION,
      dataId,
      this.trainingDataFile!.blob!,
      this.trainingDataFile!.fileName!,
      true
    );
    this._isUploading = false;
    if (fileUrl == null) {
      this.dialogService.message('training_data_upload_dialog.upload_failed');
      return;
    }

    // Create the training_data record
    const trainingData: TrainingData = {
      ownerRef: this.userService.currentUserId,
      projectRef: this.data.projectId,
      dataId,
      fileUrl,
      mimeType: 'text/csv',
      skipRows: (this.skipFirstRow?.checked ?? false) ? 1 : 0,
      title: this.trainingDataFile!.fileName!
    };

    this.dialogRef.close(trainingData);
  }

  /**
   * Handles the change event of the #fileDropzone.
   * We only support uploading one file at a time.
   * @param e The event
   * @returns void
   */
  uploadedFiles(e: Event): void {
    const el = e.target as HTMLInputElement;
    if (el.files == null) {
      return;
    }
    this.processUploadedFiles(el.files);
  }

  private processUploadedFiles(files: FileList): void {
    for (let index = 0; index < files.length; index++) {
      const file: File | null = files.item(index);
      if (file == null) {
        continue;
      }
      const trainingDataFileUpload: TrainingDataFileUpload = {
        url: URL.createObjectURL(file),
        blob: file,
        fileName: file.name
      };
      this.updateTrainingData(trainingDataFileUpload);
      this._showFilenameExists = this.data.availableTrainingData.some(t => t.title === trainingDataFileUpload.fileName);
    }
  }
}
