import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { SFProjectUserConfig } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config';
import { createTestProjectUserConfig } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config-test-data';
import { BehaviorSubject, Subject } from 'rxjs';
import { mock, when } from 'ts-mockito';
import { SFProjectUserConfigDoc } from '../app/core/models/sf-project-user-config-doc';
import { SFProjectService } from '../app/core/sf-project.service';
import { configureTestingModule } from '../xforge-common/test-utils';
import { ActivatedProjectUserConfigService } from './activated-project-user-config.service';
import { ActivatedProjectService } from './activated-project.service';
import { UserService } from './user.service';

describe('ActivatedProjectUserConfigService', () => {
  let service: ActivatedProjectUserConfigService;
  let projectIdSubject: BehaviorSubject<string | undefined>;

  const USER_ID = 'user01';
  const PROJECT_ID = 'project01';
  const PROJECT_ID_2 = 'project02';

  const mockedActivatedProjectService = mock(ActivatedProjectService);
  const mockedProjectService = mock(SFProjectService);
  const mockedUserService = mock(UserService);

  function createTestDoc(projectId: string): {
    doc: SFProjectUserConfigDoc;
    config: SFProjectUserConfig;
    changesSubject: Subject<void>;
  } {
    const changesSubject = new Subject<void>();
    const config = createTestProjectUserConfig({
      projectRef: projectId,
      ownerRef: USER_ID,
      selectedTask: 'translate'
    });

    const doc = {
      id: `${projectId}:${USER_ID}`,
      data: config,
      changes$: changesSubject.asObservable()
    } as any;

    return { doc, config, changesSubject };
  }

  configureTestingModule(() => ({
    providers: [
      ActivatedProjectUserConfigService,
      { provide: ActivatedProjectService, useMock: mockedActivatedProjectService },
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: UserService, useMock: mockedUserService }
    ]
  }));

  beforeEach(() => {
    projectIdSubject = new BehaviorSubject<string | undefined>(undefined);
    when(mockedActivatedProjectService.projectId$).thenReturn(projectIdSubject.asObservable());
    when(mockedUserService.currentUserId).thenReturn(USER_ID);
    service = TestBed.inject(ActivatedProjectUserConfigService);
  });

  it('should initially emit undefined when no project is active', fakeAsync(() => {
    let emittedDoc: SFProjectUserConfigDoc | undefined;
    let emittedConfig: SFProjectUserConfig | undefined;

    service.projectUserConfigDoc$.subscribe(doc => (emittedDoc = doc));
    service.projectUserConfig$.subscribe(config => (emittedConfig = config));
    tick();

    expect(emittedDoc).toBeUndefined();
    expect(emittedConfig).toBeUndefined();
  }));

  it('should emit project user config when project becomes active', fakeAsync(() => {
    const { doc, config } = createTestDoc(PROJECT_ID);
    when(mockedProjectService.getUserConfig(PROJECT_ID, USER_ID)).thenResolve(doc);

    let emittedDoc: SFProjectUserConfigDoc | undefined;
    let emittedConfig: SFProjectUserConfig | undefined;
    service.projectUserConfigDoc$.subscribe(doc => (emittedDoc = doc));
    service.projectUserConfig$.subscribe(config => (emittedConfig = config));

    projectIdSubject.next(PROJECT_ID);
    tick();

    expect(emittedDoc).toBe(doc);
    expect(emittedConfig).toBe(config);
  }));

  it('should emit updated project user config when config changes', fakeAsync(() => {
    const { doc, changesSubject } = createTestDoc(PROJECT_ID);
    when(mockedProjectService.getUserConfig(PROJECT_ID, USER_ID)).thenResolve(doc);

    projectIdSubject.next(PROJECT_ID);
    tick();

    let emissionCount = 0;
    let lastEmittedDoc: SFProjectUserConfigDoc | undefined;

    service.projectUserConfigDoc$.subscribe(doc => {
      lastEmittedDoc = doc;
      emissionCount++;
    });
    tick();
    emissionCount = 0; // Reset after initial emission

    changesSubject.next();
    tick();

    expect(emissionCount).toBe(1);
    expect(lastEmittedDoc).toBe(doc);
  }));

  it('should handle switching between projects', fakeAsync(() => {
    const project1 = createTestDoc(PROJECT_ID);
    const project2 = createTestDoc(PROJECT_ID_2);

    when(mockedProjectService.getUserConfig(PROJECT_ID, USER_ID)).thenResolve(project1.doc);
    when(mockedProjectService.getUserConfig(PROJECT_ID_2, USER_ID)).thenResolve(project2.doc);

    let currentDoc: SFProjectUserConfigDoc | undefined;
    service.projectUserConfigDoc$.subscribe(doc => (currentDoc = doc));

    projectIdSubject.next(PROJECT_ID);
    tick();
    expect(currentDoc).toBe(project1.doc);

    projectIdSubject.next(PROJECT_ID_2);
    tick();
    expect(currentDoc).toBe(project2.doc);
  }));

  it('should handle case where project user config is not available', fakeAsync(() => {
    when(mockedProjectService.getUserConfig('missing-project', USER_ID)).thenResolve(undefined as any);

    let doc: SFProjectUserConfigDoc | undefined;
    service.projectUserConfigDoc$.subscribe(d => (doc = d));

    projectIdSubject.next('missing-project');
    tick();
    expect(doc).toBeUndefined();
  }));
});
