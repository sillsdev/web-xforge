import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { mock, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { DraftGenerationService } from '../draft-generation.service';
import { DraftHistoryListComponent } from './draft-history-list.component';

const mockActivatedProjectService: ActivatedProjectService = mock(ActivatedProjectService);
const mockDraftGenerationService: DraftGenerationService = mock(DraftGenerationService);

describe('DraftHistoryListComponent', () => {
  let component: DraftHistoryListComponent;
  let fixture: ComponentFixture<DraftHistoryListComponent>;

  configureTestingModule(() => ({
    imports: [TestTranslocoModule],
    providers: [
      { provide: ActivatedProjectService, useMock: mockActivatedProjectService },
      { provide: DraftGenerationService, useMock: mockDraftGenerationService }
    ]
  }));

  beforeEach(() => {
    const mockProjectId = 'project01';
    const mockProjectId$ = new BehaviorSubject<string>(mockProjectId);
    when(mockActivatedProjectService.projectId$).thenReturn(mockProjectId$);

    fixture = TestBed.createComponent(DraftHistoryListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
