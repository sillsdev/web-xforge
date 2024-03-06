import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, Inject, ViewChild } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatLegacyButtonModule as MatButtonModule } from '@angular/material/legacy-button';
import { MatCheckbox, MatCheckboxModule } from '@angular/material/checkbox';
import {
  MatLegacyDialogModule as MatDialogModule,
  MatLegacyDialogRef as MatDialogRef,
  MAT_LEGACY_DIALOG_DATA as MAT_DIALOG_DATA
} from '@angular/material/legacy-dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslocoModule } from '@ngneat/transloco';
import { TrainingData } from 'realtime-server/lib/esm/scriptureforge/models/training-data';
import { DialogService } from 'xforge-common/dialog.service';
import { FileService } from 'xforge-common/file.service';
import { I18nService } from 'xforge-common/i18n.service';
import { FileType } from 'xforge-common/models/file-offline-data';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { UserService } from 'xforge-common/user.service';
import { objectId } from 'xforge-common/utils';
import { TrainingDataDoc } from '../../../core/models/training-data-doc';
import { TrainingDataService } from './training-data.service';

export interface TrainingDataUploadDialogData {
  projectId: string;
}

export interface TrainingDataUploadDialogResult {
  dataId: string;
}

export interface TrainingDataFileUpload {
  url?: string;
  fileName?: string;
  blob?: Blob;
}

@Component({
  selector: 'app-training-data-upload-dialog',
  templateUrl: './training-data-upload-dialog.component.html',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatIconModule,
    MatProgressSpinnerModule,
    TranslocoModule
  ],
  styleUrls: ['./training-data-upload-dialog.component.scss']
})
export class TrainingDataUploadDialogComponent extends SubscriptionDisposable implements AfterViewInit {
  @ViewChild('dropzone') dropzone?: ElementRef<HTMLDivElement>;
  @ViewChild('fileDropzone') fileDropzone?: ElementRef<HTMLInputElement>;
  @ViewChild('skipFirstRow') skipFirstRow?: MatCheckbox;
  private _isUploading: boolean = false;
  private _showNotUploadedError: boolean = false;
  private trainingDataFile?: TrainingDataFileUpload;

  constructor(
    readonly i18n: I18nService,
    @Inject(MAT_DIALOG_DATA) public data: TrainingDataUploadDialogData,
    private readonly dialogRef: MatDialogRef<
      TrainingDataUploadDialogComponent,
      TrainingDataUploadDialogResult | undefined
    >,
    private readonly dialogService: DialogService,
    private readonly fileService: FileService,
    private readonly trainingDataService: TrainingDataService,
    private readonly userService: UserService
  ) {
    super();
  }

  get hasBeenUploaded(): boolean {
    return this.trainingDataFile?.blob != null && this.trainingDataFile?.fileName != null;
  }

  get isUploading(): boolean {
    return this._isUploading;
  }

  get showNotUploadedError(): boolean {
    return this._showNotUploadedError;
  }

  get trainingDataFilename(): string {
    return this.trainingDataFile?.fileName ?? '';
  }

  updateTrainingData(trainingDataFile: TrainingDataFileUpload): void {
    this.trainingDataFile = trainingDataFile;
  }

  deleteTrainingData(): void {
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
      this._showNotUploadedError = true;
      return;
    }

    this._showNotUploadedError = false;
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
    let trainingData: TrainingData = {
      ownerRef: this.userService.currentUserId,
      projectRef: this.data.projectId,
      dataId,
      fileUrl,
      mimeType: 'text/csv',
      skipRows: this.skipFirstRow?.checked ?? false ? 1 : 0,
      title: this.trainingDataFile!.fileName!
    };
    await this.trainingDataService.createTrainingDataAsync(trainingData);

    this.dialogRef.close({ dataId });
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
    }
  }
}
