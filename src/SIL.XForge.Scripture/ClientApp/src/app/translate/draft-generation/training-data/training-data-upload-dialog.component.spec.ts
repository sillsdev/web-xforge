import { OverlayContainer } from '@angular/cdk/overlay';
import { HttpErrorResponse, HttpStatusCode } from '@angular/common/http';
import { NgZone } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { ngfModule } from 'angular-file';
import { TrainingData } from 'realtime-server/lib/esm/scriptureforge/models/training-data';
import { anything, mock, verify, when } from 'ts-mockito';
import { DialogService } from 'xforge-common/dialog.service';
import { FileService } from 'xforge-common/file.service';
import { FileType } from 'xforge-common/models/file-offline-data';
import { provideTestOnlineStatus } from 'xforge-common/test-online-status-providers';
import { ChildViewContainerComponent, configureTestingModule, getTestTranslocoModule } from 'xforge-common/test-utils';
import { UserService } from 'xforge-common/user.service';
import { TrainingDataDoc } from '../../../core/models/training-data-doc';
import { TrainingDataFileUpload, TrainingDataUploadDialogComponent } from './training-data-upload-dialog.component';
import { TrainingDataService } from './training-data.service';

const mockedDialogService = mock(DialogService);
const mockedFileService = mock(FileService);
const mockedTrainingDataService = mock(TrainingDataService);
const mockedUserService = mock(UserService);

describe('TrainingDataUploadDialogComponent', () => {
  configureTestingModule(() => ({
    imports: [ngfModule, getTestTranslocoModule()],
    providers: [
      provideTestOnlineStatus(),
      { provide: DialogService, useMock: mockedDialogService },
      { provide: FileService, useMock: mockedFileService },
      { provide: TrainingDataService, useMock: mockedTrainingDataService },
      { provide: UserService, useMock: mockedUserService }
    ]
  }));

  let overlayContainer: OverlayContainer;
  beforeEach(() => {
    overlayContainer = TestBed.inject(OverlayContainer);
  });
  afterEach(() => {
    // Prevents 'Error: Test did not clean up its overlay container content.'
    overlayContainer.ngOnDestroy();
  });

  it('cannot save if offline', async () => {
    const env = new TestEnvironment();
    when(
      mockedFileService.onlineUploadFile(
        anything(),
        anything(),
        anything(),
        anything(),
        anything(),
        anything(),
        anything()
      )
    ).thenThrow(new HttpErrorResponse({ status: 0 }));
    let result: TrainingData = { dataId: '' } as TrainingData;
    env.dialogRef.afterClosed().subscribe((_result: TrainingData) => {
      result = _result;
    });
    env.component.updateTrainingData(env.trainingDataFile);
    await env.component.save();
    await env.wait();

    verify(
      mockedFileService.onlineUploadFile(
        anything(),
        anything(),
        anything(),
        anything(),
        anything(),
        anything(),
        anything()
      )
    ).once();
    expect(result.dataId).toEqual('');
  });

  it('should show an error message if the file is invalid', async () => {
    const env = new TestEnvironment();
    when(
      mockedFileService.onlineUploadFile(
        anything(),
        anything(),
        anything(),
        anything(),
        anything(),
        anything(),
        anything()
      )
    ).thenThrow(new HttpErrorResponse({ status: HttpStatusCode.BadRequest }));
    let result: TrainingData = { dataId: '' } as TrainingData;
    env.dialogRef.afterClosed().subscribe((_result: TrainingData) => {
      result = _result;
    });
    env.component.updateTrainingData(env.trainingDataFile);
    await env.component.save();
    await env.wait();

    verify(
      mockedFileService.onlineUploadFile(
        anything(),
        anything(),
        anything(),
        anything(),
        anything(),
        anything(),
        anything()
      )
    ).once();
    verify(mockedDialogService.message(anything())).once();
    expect(result.dataId).toEqual('');
  });

  it('should show an error message if the file for all other errors', async () => {
    const env = new TestEnvironment();
    when(
      mockedFileService.onlineUploadFile(
        anything(),
        anything(),
        anything(),
        anything(),
        anything(),
        anything(),
        anything()
      )
    ).thenThrow(new HttpErrorResponse({ status: HttpStatusCode.NotFound }));
    let result: TrainingData = { dataId: '' } as TrainingData;
    env.dialogRef.afterClosed().subscribe((_result: TrainingData) => {
      result = _result;
    });
    env.component.updateTrainingData(env.trainingDataFile);
    await env.component.save();
    await env.wait();

    verify(
      mockedFileService.onlineUploadFile(
        anything(),
        anything(),
        anything(),
        anything(),
        anything(),
        anything(),
        anything()
      )
    ).once();
    verify(mockedDialogService.message(anything())).once();
    expect(result.dataId).toEqual('');
  });

  it('should upload training data and return the object on save', async () => {
    const env = new TestEnvironment();
    let result: TrainingData = { dataId: '' } as TrainingData;
    env.dialogRef.afterClosed().subscribe((_result: TrainingData) => {
      result = _result;
    });
    env.component.updateTrainingData(env.trainingDataFile);
    await env.component.save();
    await env.wait();

    expect(result.dataId).not.toEqual('');
  });

  it('can drag and drop to initiate an upload', async () => {
    const env = new TestEnvironment();
    const dataTransfer = new DataTransfer();
    for (const file of TestEnvironment.uploadFiles) {
      dataTransfer.items.add(file);
    }
    const dropEvent = new DragEvent('drop', { dataTransfer });
    env.dropzoneElement.dispatchEvent(dropEvent);
    await env.wait();

    expect(env.wrapperTrainingDataFile.classList.contains('valid')).toBe(true);
  });

  it('can browse to upload files', async () => {
    const env = new TestEnvironment();
    const dataTransfer = new DataTransfer();
    for (const file of TestEnvironment.uploadFiles) {
      dataTransfer.items.add(file);
    }
    const event = new Event('change');
    env.fileUploadElement.files = dataTransfer.files;
    env.fileUploadElement.dispatchEvent(event);
    await env.wait();

    expect(env.wrapperTrainingDataFile.classList.contains('valid')).toBe(true);
    expect(env.fileNameExistsWarning).toBeNull();
  });

  it('shows a warning when a file with the same name exists', async () => {
    const existingFile = {
      title: 'test.csv'
    } as TrainingData;
    const env = new TestEnvironment([existingFile]);
    const dataTransfer = new DataTransfer();
    for (const file of TestEnvironment.uploadFiles) {
      dataTransfer.items.add(file);
    }
    const event = new Event('change');
    env.fileUploadElement.files = dataTransfer.files;
    env.fileUploadElement.dispatchEvent(event);
    await env.wait();

    expect(env.wrapperTrainingDataFile.classList.contains('valid')).toBe(true);
    expect(env.fileNameExistsWarning).not.toBeNull();
  });
});

class TestEnvironment {
  static uploadFiles: File[] = [new File([], 'test.csv')];

  readonly fixture: ComponentFixture<ChildViewContainerComponent>;
  readonly ngZone: NgZone = TestBed.inject(NgZone);
  readonly component: TrainingDataUploadDialogComponent;
  readonly dialogRef: MatDialogRef<TrainingDataUploadDialogComponent>;
  readonly trainingDataFile: TrainingDataFileUpload;

  constructor(availableTrainingData: TrainingData[] = []) {
    when(
      mockedFileService.onlineUploadFile(
        FileType.TrainingData,
        anything(),
        TrainingDataDoc.COLLECTION,
        anything(),
        anything(),
        anything(),
        true
      )
    ).thenResolve('training data file url');
    when(mockedUserService.currentUserId).thenReturn('user01');

    const blob = new Blob(['source_1,target_2\nsource_2,target_2'], { type: 'text/csv' });
    this.trainingDataFile = {
      blob,
      fileName: 'test.csv',
      url: URL.createObjectURL(new File([blob], 'test.wav'))
    };

    this.fixture = TestBed.createComponent(ChildViewContainerComponent);
    this.dialogRef = TestBed.inject(MatDialog).open(TrainingDataUploadDialogComponent, {
      data: { projectId: 'project01', availableTrainingData }
    });
    this.component = this.dialogRef.componentInstance;
    this.fixture.detectChanges();
  }

  get dropzoneElement(): HTMLElement {
    return this.overlayContainerElement.querySelector('.dropzone') as HTMLElement;
  }

  get fileUploadElement(): HTMLInputElement {
    return this.dropzoneElement.querySelector('input[type=file]') as HTMLInputElement;
  }

  get fileNameExistsWarning(): HTMLElement {
    return this.overlayContainerElement.querySelector('.wrapper-training-data-file app-info') as HTMLElement;
  }

  get wrapperTrainingDataFile(): HTMLElement {
    return this.overlayContainerElement.querySelector('.wrapper-training-data-file') as HTMLElement;
  }

  private get overlayContainerElement(): HTMLElement {
    return this.fixture.nativeElement.parentElement.querySelector('.cdk-overlay-container');
  }

  async wait(ms: number = 200): Promise<void> {
    await new Promise(resolve => this.ngZone.runOutsideAngular(() => setTimeout(resolve, ms)));
    this.fixture.detectChanges();
  }
}
