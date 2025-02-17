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
import { TrainingDataMultiSelectComponent, TrainingDataOption } from './training-data-multi-select.component';
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
  const mockTrainingData: TrainingData[] = [
    { dataId: 'data01', fileUrl: '', mimeType: '', skipRows: 0, title: '', projectRef: '', ownerRef: '' },
    { dataId: 'data02', fileUrl: '', mimeType: '', skipRows: 0, title: '', projectRef: '', ownerRef: '' },
    { dataId: 'data03', fileUrl: '', mimeType: '', skipRows: 0, title: '', projectRef: '', ownerRef: '' }
  ];
  const mockSelectedTrainingDataIds: string[] = ['data01', 'data03'];

  configureTestingModule(() => ({
    imports: [TestTranslocoModule],
    providers: [
      { provide: ActivatedProjectService, useMock: mockActivatedProjectService },
      { provide: DialogService, useMock: mockDialogService },
      { provide: I18nService, useMock: mockI18nService },
      { provide: TrainingDataService, useMock: mockTrainingDataService },
      { provide: TrainingDataUploadDialogComponent, useMock: mockTrainingDataUploadDialogComponent },
      { provide: UserService, useMock: mockUserService }
    ]
  }));

  beforeEach(fakeAsync(() => {
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
    component.selectedTrainingDataIds = mockSelectedTrainingDataIds;
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

  it('can emit chip list change events', fakeAsync(async () => {
    let result: string[] = [];
    component.trainingDataSelect.subscribe((_result: string[]) => {
      result = _result;
    });
    component.ngOnChanges();
    component.onChipListChange({ selected: true, value: mockTrainingData[2] });
    tick();

    expect(result).toEqual(['data01']);
  }));

  it('should delete training data', fakeAsync(async () => {
    await component.deleteTrainingData(mockTrainingData[0]);
    tick();

    verify(mockTrainingDataService.deleteTrainingDataAsync(mockTrainingData[0])).once();
    expect().nothing();
  }));

  it('should initialize training data options on ngOnChanges', () => {
    const mockTrainingDataOptions: TrainingDataOption[] = [
      { value: mockTrainingData[0], selected: true },
      { value: mockTrainingData[1], selected: false },
      { value: mockTrainingData[2], selected: true }
    ];

    component.ngOnChanges();

    expect(component.trainingDataOptions).toEqual(mockTrainingDataOptions);
  });

  it('should show the upload dialog', fakeAsync(() => {
    let result: string[] = [];
    component.trainingDataSelect.subscribe((_result: string[]) => {
      result = _result;
    });
    component.openUploadDialog();
    tick();

    verify(mockDialogService.openMatDialog(TrainingDataUploadDialogComponent, anything())).once();
    expect(result).toEqual([...mockSelectedTrainingDataIds, 'data04']);
  }));
});
