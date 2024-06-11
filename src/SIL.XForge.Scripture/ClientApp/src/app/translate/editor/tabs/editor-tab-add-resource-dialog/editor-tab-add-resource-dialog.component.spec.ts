import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { SFProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { createTestProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { anything, mock, verify, when } from 'ts-mockito';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { ParatextProject } from '../../../../core/models/paratext-project';
import { SFProjectDoc } from '../../../../core/models/sf-project-doc';
import { ParatextService, SelectableProject } from '../../../../core/paratext.service';
import { PermissionsService } from '../../../../core/permissions.service';
import { SFProjectService } from '../../../../core/sf-project.service';
import { EditorTabAddResourceDialogComponent } from './editor-tab-add-resource-dialog.component';

const mockSFProjectService = mock(SFProjectService);
const mockParatextService = mock(ParatextService);
const mockMatDialogRef = mock(MatDialogRef);
const mockPermissionsService = mock(PermissionsService);

describe('EditorTabAddResourceDialogComponent', () => {
  configureTestingModule(() => ({
    imports: [TestOnlineStatusModule.forRoot(), TestTranslocoModule],
    providers: [
      { provide: SFProjectService, useMock: mockSFProjectService },
      { provide: ParatextService, useMock: mockParatextService },
      { provide: PermissionsService, useMock: mockPermissionsService },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService },
      { provide: MatDialogRef, useMock: mockMatDialogRef },
      { provide: MAT_DIALOG_DATA, useValue: {} }
    ]
  }));

  afterEach(() => {
    expect(true).toBe(true); // Suppress 'no expectations' warning
  });

  it('should call getProjectsAndResources when ngOnInit is called', fakeAsync(() => {
    const env = new TestEnvironment();
    spyOn<any>(env.component, 'getProjectsAndResources');
    env.component.ngOnInit();
    tick();
    expect(env.component['getProjectsAndResources']).toHaveBeenCalled();
  }));

  describe('getProjectsAndResources', () => {
    it('should set projects and resources and clear error flags', fakeAsync(() => {
      const env = new TestEnvironment();
      env.component['getProjectsAndResources']();
      env.component.projectLoadingFailed = true;
      env.component.resourceLoadingFailed = true;
      tick();
      verify(mockParatextService.getProjects()).once();
      verify(mockParatextService.getResources()).once();
      expect(env.component.projects).toEqual(env.projects);
      expect(env.component.resources).toEqual(env.resources);
      expect(env.component.projectLoadingFailed).toBe(false);
      expect(env.component.resourceLoadingFailed).toBe(false);
    }));

    it('should filter projects that already have a corresponding SF project OR are connectable', fakeAsync(() => {
      const env = new TestEnvironment();
      const expectedResult = [
        env.createTestParatextProject(1, { projectId: 'p1', isConnectable: true }),
        env.createTestParatextProject(2, { projectId: 'p2', isConnectable: false }),
        env.createTestParatextProject(3, { projectId: undefined, isConnectable: true })
      ];
      const projects = [
        ...expectedResult,
        env.createTestParatextProject(4, { projectId: undefined, isConnectable: false }),
        env.createTestParatextProject(5, { projectId: undefined, isConnectable: false })
      ];
      when(mockParatextService.getProjects()).thenReturn(Promise.resolve(projects));
      env.component['getProjectsAndResources']();
      tick();
      expect(env.component.projects).toEqual(expectedResult);
    }));

    it('should set error flags when getProjects or getResources throw an error', fakeAsync(() => {
      const env = new TestEnvironment();
      when(mockParatextService.getProjects()).thenReject(new Error());
      when(mockParatextService.getResources()).thenReject(new Error());
      env.component['getProjectsAndResources']();
      tick();
      expect(env.component.projectLoadingFailed).toBe(true);
      expect(env.component.resourceLoadingFailed).toBe(true);
    }));
  });

  describe('confirmSelection', () => {
    it('should call fetchProject when confirmSelection is called', fakeAsync(() => {
      const env = new TestEnvironment();
      env.component.confirmSelection();
      tick();
      verify(mockSFProjectService.getOrCreateRealtimeProject(env.paratextId)).once();
    }));

    it('should call syncProject and not close dialog if fetched project has no texts when confirmSelection is called', fakeAsync(() => {
      const env = new TestEnvironment();
      when(mockPermissionsService.canSync(anything())).thenReturn(true);
      env.setupProject({ texts: [] });
      env.component.confirmSelection();
      tick();
      verify(mockSFProjectService.onlineSync(env.projectId)).once();
      verify(mockMatDialogRef.close(anything())).never();
    }));

    it('should call syncProject and close dialog if fetched project has texts when confirmSelection is called', fakeAsync(() => {
      const env = new TestEnvironment();
      when(mockPermissionsService.canSync(anything())).thenReturn(true);
      env.setupProject({ texts: [{} as any] });
      env.component.confirmSelection();
      tick();
      verify(mockSFProjectService.onlineSync(env.projectId)).once();
      verify(mockMatDialogRef.close(anything())).once();
    }));

    it('should not call syncProject and close dialog if user does not have sync permission', fakeAsync(() => {
      const env = new TestEnvironment();
      when(mockPermissionsService.canSync(anything())).thenReturn(false);
      env.setupProject({ texts: [{} as any] });
      env.component.confirmSelection();
      tick();
      verify(mockSFProjectService.onlineSync(env.projectId)).never();
      verify(mockMatDialogRef.close(anything())).once();
    }));

    it('should set projectFetchFailed to true when fetchProject returns undefined', fakeAsync(() => {
      const env = new TestEnvironment();
      when(mockSFProjectService.getOrCreateRealtimeProject(env.paratextId)).thenReturn(Promise.resolve(undefined));
      env.component.confirmSelection();
      tick();
      verify(mockSFProjectService.getOrCreateRealtimeProject(env.paratextId)).once();
      expect(env.component.projectFetchFailed).toBe(true);
    }));

    it('should set syncFailed to true and call cancelSync when syncProject throws an error', fakeAsync(() => {
      const env = new TestEnvironment();
      when(mockPermissionsService.canSync(anything())).thenReturn(true);
      env.setupProject({ texts: [] });
      when(mockSFProjectService.onlineSync(anything())).thenReject(new Error());
      spyOn<any>(env.component, 'cancelSync');
      env.component.confirmSelection();
      tick();
      expect(env.component.syncFailed).toBe(true);
      expect(env.component['cancelSync']).toHaveBeenCalled();
    }));
  });

  it('should reset errors when onProjectSelected is called', () => {
    const env = new TestEnvironment();
    env.component.projectLoadingFailed = true;
    env.component.resourceLoadingFailed = true;
    env.component.projectFetchFailed = true;
    env.component.syncFailed = true;
    env.component.onProjectSelected({} as SelectableProject);
    expect(env.component.projectLoadingFailed).toBe(false);
    expect(env.component.resourceLoadingFailed).toBe(false);
    expect(env.component.projectFetchFailed).toBe(false);
    expect(env.component.syncFailed).toBe(false);
  });
});

class TestEnvironment {
  component: EditorTabAddResourceDialogComponent;
  fixture: ComponentFixture<EditorTabAddResourceDialogComponent>;

  projects: ParatextProject[] = [this.createTestParatextProject(1), this.createTestParatextProject(2)];
  resources: ParatextProject[] = [this.createTestParatextProject(3), this.createTestParatextProject(4)];
  testProjectDoc!: SFProjectDoc;

  projectId = 'projectId';
  paratextId = 'testParatextId';

  constructor() {
    this.setupProject();

    when(mockParatextService.getProjects()).thenReturn(Promise.resolve(this.projects));
    when(mockParatextService.getResources()).thenReturn(Promise.resolve(this.resources));
    when(mockSFProjectService.getOrCreateRealtimeProject(this.paratextId)).thenCall(() =>
      Promise.resolve(this.testProjectDoc.id)
    );
    when(mockSFProjectService.get(this.projectId)).thenCall(() => Promise.resolve(this.testProjectDoc));
    when(mockSFProjectService.onlineSync(this.projectId)).thenReturn(Promise.resolve());

    this.fixture = TestBed.createComponent(EditorTabAddResourceDialogComponent);
    this.component = this.fixture.componentInstance;

    this.component.form.setValue({ sourceParatextId: this.paratextId });
  }

  setupProject(overrides?: Partial<SFProject>): void {
    this.testProjectDoc = {
      id: this.projectId,
      data: createTestProject(overrides)
    } as SFProjectDoc;
  }

  createTestParatextProject(index: number, overrides?: Partial<ParatextProject>): ParatextProject {
    return {
      paratextId: `ptId${index}`,
      name: `Paratext Project ${index}`,
      shortName: `PTProject${index}`,
      languageTag: 'en',
      projectId: `projectId${index}`,
      isConnectable: true,
      isConnected: false,
      ...overrides
    };
  }
}
