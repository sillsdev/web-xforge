import { OverlayContainer } from '@angular/cdk/overlay';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { NgModule, NgZone } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  MatLegacyDialog as MatDialog,
  MatLegacyDialogModule as MatDialogModule,
  MatLegacyDialogRef as MatDialogRef
} from '@angular/material/legacy-dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ngfModule } from 'angular-file';
import { anything, mock, when } from 'ts-mockito';
import { DialogService } from 'xforge-common/dialog.service';
import { FileService } from 'xforge-common/file.service';
import { FileType } from 'xforge-common/models/file-offline-data';
import { ChildViewContainerComponent, configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { TrainingDataDoc } from '../../../core/models/training-data-doc';
import {
  TrainingDataFileUpload,
  TrainingDataUploadDialogComponent,
  TrainingDataUploadDialogResult
} from './training-data-upload-dialog.component';
import { TrainingDataService } from './training-data.service';

const mockedDialogService = mock(DialogService);
const mockedFileService = mock(FileService);
const mockedTrainingDataService = mock(TrainingDataService);
const mockedUserService = mock(UserService);

describe('TrainingDataUploadDialogComponent', () => {
  configureTestingModule(() => ({
    imports: [DialogTestModule],
    providers: [
      { provide: DialogService, useMock: mockedDialogService },
      { provide: FileService, useMock: mockedFileService },
      { provide: TrainingDataService, useMock: mockedTrainingDataService },
      { provide: UserService, useMock: mockedUserService }
    ]
  }));

  let env: TestEnvironment;

  let overlayContainer: OverlayContainer;
  beforeEach(() => {
    overlayContainer = TestBed.inject(OverlayContainer);
    env = new TestEnvironment();
  });
  afterEach(() => {
    // Prevents 'Error: Test did not clean up its overlay container content.'
    overlayContainer.ngOnDestroy();
  });

  it('should upload training data and return the object on save', async () => {
    let result: TrainingDataUploadDialogResult = { dataId: '' };
    env.dialogRef.afterClosed().subscribe((_result: TrainingDataUploadDialogResult) => {
      result = _result;
    });
    env.component.updateTrainingData(env.trainingDataFile);
    await env.component.save();
    await env.wait();

    expect(result.dataId).not.toEqual('');
  });

  it('can drag and drop to initiate an upload', async () => {
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
    const dataTransfer = new DataTransfer();
    for (const file of TestEnvironment.uploadFiles) {
      dataTransfer.items.add(file);
    }
    const event = new Event('change');
    env.fileUploadElement.files = dataTransfer.files;
    env.fileUploadElement.dispatchEvent(event);
    await env.wait();

    expect(env.wrapperTrainingDataFile.classList.contains('valid')).toBe(true);
  });
});

@NgModule({
  imports: [
    HttpClientTestingModule,
    MatDialogModule,
    ngfModule,
    NoopAnimationsModule,
    TestTranslocoModule,
    UICommonModule
  ]
})
class DialogTestModule {}

class TestEnvironment {
  static uploadFiles: File[] = [new File([], 'test.csv')];

  readonly fixture: ComponentFixture<ChildViewContainerComponent>;
  readonly ngZone: NgZone = TestBed.inject(NgZone);
  readonly component: TrainingDataUploadDialogComponent;
  readonly dialogRef: MatDialogRef<TrainingDataUploadDialogComponent>;
  readonly trainingDataFile: TrainingDataFileUpload;

  constructor() {
    when(
      mockedFileService.uploadFile(
        FileType.TrainingData,
        anything(),
        TrainingDataDoc.COLLECTION,
        anything(),
        anything(),
        anything(),
        anything(),
        true
      )
    ).thenResolve('training data file url');
    when(mockedUserService.currentUserId).thenReturn('user01');

    let blob = new Blob(['source_1,target_2\nsource_2,target_2'], { type: 'text/csv' });
    this.trainingDataFile = {
      blob,
      fileName: 'test.csv',
      url: URL.createObjectURL(new File([blob], 'test.wav'))
    };

    this.fixture = TestBed.createComponent(ChildViewContainerComponent);
    this.dialogRef = TestBed.inject(MatDialog).open(TrainingDataUploadDialogComponent, {
      data: { projectId: 'project01' }
    });
    this.component = this.dialogRef.componentInstance;
    this.fixture.detectChanges();
  }

  get fileUploadElement(): HTMLInputElement {
    return this.dropzoneElement.querySelector('input[type=file]') as HTMLInputElement;
  }

  get dropzoneElement(): HTMLElement {
    return this.overlayContainerElement.querySelector('.dropzone') as HTMLElement;
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
