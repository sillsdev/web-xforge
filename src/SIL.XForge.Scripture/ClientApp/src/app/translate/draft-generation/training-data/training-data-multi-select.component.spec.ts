import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { TrainingData } from 'realtime-server/lib/esm/scriptureforge/models/training-data';
import { BehaviorSubject, of } from 'rxjs';
import { anything, instance, mock, verify, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nService } from 'xforge-common/i18n.service';
import { Locale } from 'xforge-common/models/i18n-locale';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { TrainingDataMultiSelectComponent } from './training-data-multi-select.component';
import { TrainingDataUploadDialogComponent } from './training-data-upload-dialog.component';
import { TrainingDataService } from './training-data.service';

const mockActivatedProjectService = mock(ActivatedProjectService);
const mockDialogService = mock(DialogService);
const mockI18nService = mock(I18nService);
const mockTrainingDataService = mock(TrainingDataService);
const mockTrainingDataUploadDialogComponent = mock<MatDialogRef<TrainingDataUploadDialogComponent>>(MatDialogRef);
const mockUserService = mock(UserService);

describe('TrainingDataMultiSelectComponent', () => {
  let component: TrainingDataMultiSelectComponent;
  let fixture: ComponentFixture<TrainingDataMultiSelectComponent>;

  const locale: Locale = {
    localName: 'English',
    englishName: 'English',
    canonicalTag: 'en',
    direction: 'ltr',
    tags: [],
    production: false
  };
  const mockProjectId: string = 'project01';
  const mockProjectId$ = new BehaviorSubject<string>(mockProjectId);
  const mockProjectDoc: SFProjectProfileDoc = {
    id: mockProjectId,
    data: createTestProjectProfile({
      userRoles: { user01: SFProjectRole.ParatextAdministrator }
    })
  } as SFProjectProfileDoc;
  const mockProjectDoc$ = new BehaviorSubject<SFProjectProfileDoc>(mockProjectDoc);
  let mockTrainingData: TrainingData[];

  configureTestingModule(() => ({
    imports: [TestTranslocoModule],
    providers: [
      { provide: ActivatedProjectService, useMock: mockActivatedProjectService },
      { provide: DialogService, useMock: mockDialogService },
      { provide: I18nService, useMock: mockI18nService },
      { provide: TrainingDataService, useMock: mockTrainingDataService },
      { provide: UserService, useMock: mockUserService }
    ]
  }));

  beforeEach(fakeAsync(() => {
    mockTrainingData = [
      { dataId: 'data01', fileUrl: '', mimeType: '', skipRows: 0, title: '', projectRef: '', ownerRef: 'user01' },
      { dataId: 'data02', fileUrl: '', mimeType: '', skipRows: 0, title: '', projectRef: '', ownerRef: 'user01' },
      { dataId: 'data03', fileUrl: '', mimeType: '', skipRows: 0, title: '', projectRef: '', ownerRef: 'user01' }
    ];
    when(mockActivatedProjectService.projectId).thenReturn(mockProjectId);
    when(mockActivatedProjectService.projectId$).thenReturn(mockProjectId$);
    when(mockActivatedProjectService.projectDoc).thenReturn(mockProjectDoc);
    when(mockActivatedProjectService.projectDoc$).thenReturn(mockProjectDoc$);
    when(mockDialogService.openMatDialog(TrainingDataUploadDialogComponent, anything())).thenReturn(
      instance(mockTrainingDataUploadDialogComponent)
    );
    when(
      mockDialogService.confirm('training_data_multi_select.confirm_delete', 'training_data_multi_select.delete')
    ).thenResolve(true);
    when(mockI18nService.locale$).thenReturn(of(locale));
    when(mockTrainingDataUploadDialogComponent.afterClosed()).thenReturn(of({ dataId: 'data04' }));
    fixture = TestBed.createComponent(TrainingDataMultiSelectComponent);
    component = fixture.componentInstance;
    component.availableTrainingData = mockTrainingData;
    fixture.detectChanges();
    tick();
  }));

  it('can delete training data', fakeAsync(() => {
    when(mockUserService.currentUserId).thenReturn('user01');
    const canDelete = component.canDeleteTrainingData(mockTrainingData[0]);

    expect(canDelete).toBeTruthy();
  }));

  it('can not delete training data', fakeAsync(() => {
    when(mockUserService.currentUserId).thenReturn('user02');
    const canDelete = component.canDeleteTrainingData(mockTrainingData[0]);

    expect(canDelete).toBeFalsy();
  }));

  it('should delete training data', fakeAsync(async () => {
    let result: TrainingData[] = [];
    component.trainingDataSelect.subscribe((_result: TrainingData[]) => {
      result = _result;
    });
    await component.deleteTrainingData(mockTrainingData[0]);
    tick();

    expect(result).not.toContain(mockTrainingData[0]);
  }));

  it('should show the upload dialog', fakeAsync(() => {
    let result: TrainingData[] = [];
    component.trainingDataSelect.subscribe((_result: TrainingData[]) => {
      result = _result;
    });
    component.openUploadDialog();
    tick();

    verify(mockDialogService.openMatDialog(TrainingDataUploadDialogComponent, anything())).once();
    expect(result.length).toEqual(4);
  }));
});
