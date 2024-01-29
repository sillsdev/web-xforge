import { HttpClientTestingModule } from '@angular/common/http/testing';
import { NgModule } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatLegacyDialogModule as MatDialogModule } from '@angular/material/legacy-dialog';
import { TrainingData } from 'realtime-server/lib/esm/scriptureforge/models/training-data';
import { BehaviorSubject } from 'rxjs';
import { mock, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DialogService } from 'xforge-common/dialog.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { SF_TYPE_REGISTRY } from '../../../core/models/sf-type-registry';
import { TrainingDataMultiSelectComponent, TrainingDataOption } from './training-data-multi-select.component';
import { TrainingDataService } from './training-data.service';

const mockActivatedProjectService = mock(ActivatedProjectService);
const mockDialogService = mock(DialogService);
const mockTrainingDataService = mock(TrainingDataService);
const mockUserService = mock(UserService);

describe('TrainingDataMultiSelectComponent', () => {
  let component: TrainingDataMultiSelectComponent;
  let fixture: ComponentFixture<TrainingDataMultiSelectComponent>;

  const mockProjectDoc: SFProjectProfileDoc = {
    data: { shortName: 'project', writingSystem: { tag: 'en' } }
  } as SFProjectProfileDoc;
  const mockProjectDoc$ = new BehaviorSubject<SFProjectProfileDoc>(mockProjectDoc);
  const mockTrainingData: TrainingData[] = [
    { dataId: 'data01', fileUrl: '', mimeType: '', skipRows: 0, title: '', projectRef: '', ownerRef: '' },
    { dataId: 'data02', fileUrl: '', mimeType: '', skipRows: 0, title: '', projectRef: '', ownerRef: '' },
    { dataId: 'data03', fileUrl: '', mimeType: '', skipRows: 0, title: '', projectRef: '', ownerRef: '' }
  ];
  const mockSelectedTrainingDataIds: string[] = ['data01', 'data03'];

  configureTestingModule(() => ({
    imports: [
      UICommonModule,
      DialogTestModule,
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY),
      MatChipsModule,
      MatIconModule,
      TestTranslocoModule
    ],
    provide: [
      { provide: ActivatedProjectService, useMock: mockActivatedProjectService },
      { provide: DialogService, useMock: mockDialogService },
      { provide: TrainingDataService, useMock: mockTrainingDataService },
      { provide: UserService, useMock: mockUserService }
    ]
  }));

  beforeEach(() => {
    when(mockActivatedProjectService.projectDoc).thenReturn(mockProjectDoc);
    when(mockActivatedProjectService.projectDoc$).thenReturn(mockProjectDoc$);
    fixture = TestBed.createComponent(TrainingDataMultiSelectComponent);
    component = fixture.componentInstance;
    component.availableTrainingData = mockTrainingData;
    component.selectedTrainingDataIds = mockSelectedTrainingDataIds;
    fixture.detectChanges();
  });

  it('should initialize training data options on ngOnChanges', () => {
    const mockTrainingDataOptions: TrainingDataOption[] = [
      { value: mockTrainingData[0], selected: true },
      { value: mockTrainingData[1], selected: false },
      { value: mockTrainingData[2], selected: true }
    ];

    component.ngOnChanges();

    expect(component.trainingDataOptions).toEqual(mockTrainingDataOptions);
  });
});

@NgModule({
  imports: [MatDialogModule, HttpClientTestingModule]
})
class DialogTestModule {}
