import { fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { Router } from '@angular/router';
import { OtJson0Op } from 'ot-json0';
import { SFProject, SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectUserConfig } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config';
import { Chapter, TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { anything, instance, mock, resetCalls, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { UserService } from 'xforge-common/user.service';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SFProjectUserConfigDoc } from '../../core/models/sf-project-user-config-doc';
import { PermissionsService } from '../../core/permissions.service';
import { SFProjectService } from '../../core/sf-project.service';
import { ResumeTranslateService } from './resume-translate.service';

describe('ResumeTranslateService', () => {
  const mockRouter = mock(Router);
  const mockUserService = mock(UserService);
  const mockActivatedProjectService = mock(ActivatedProjectService);
  const mockOnlineStatusService = mock(OnlineStatusService);
  const mockProjectService = mock(SFProjectService);
  const mockPermissionsService = mock(PermissionsService);

  let service: ResumeTranslateService;
  let mockedProjectDoc: SFProjectDoc;
  let activatedProjectChange$: BehaviorSubject<SFProjectProfileDoc>;

  beforeEach(async () => {
    resetCalls(mockRouter);
    resetCalls(mockUserService);
    resetCalls(mockActivatedProjectService);
    resetCalls(mockOnlineStatusService);
    resetCalls(mockProjectService);
    resetCalls(mockPermissionsService);

    activatedProjectChange$ = new BehaviorSubject<SFProjectProfileDoc>({} as SFProjectProfileDoc);

    mockedProjectDoc = mock(SFProjectDoc);
    when(mockProjectService.getUserConfig(anything(), anything())).thenResolve({} as SFProjectUserConfigDoc);

    when(mockActivatedProjectService.projectId).thenReturn('project01');
    when(mockActivatedProjectService.projectId$).thenReturn(of('project01'));
    when(mockActivatedProjectService.changes$).thenReturn(activatedProjectChange$);

    when(mockRouter.routerState).thenReturn({ snapshot: { root: {} as any } } as any);
    when(mockRouter.events).thenReturn(of());

    TestBed.configureTestingModule({
      providers: [
        ResumeTranslateService,
        { provide: Router, useFactory: () => instance(mockRouter) },
        { provide: UserService, useFactory: () => instance(mockUserService) },
        { provide: ActivatedProjectService, useFactory: () => instance(mockActivatedProjectService) },
        { provide: OnlineStatusService, useFactory: () => instance(mockOnlineStatusService) },
        { provide: SFProjectService, useFactory: () => instance(mockProjectService) },
        { provide: PermissionsService, useFactory: () => instance(mockPermissionsService) }
      ]
    });

    service = TestBed.inject(ResumeTranslateService);

    when(mockedProjectDoc.data).thenReturn({
      texts: [{ bookNum: 40, chapters: [{ number: 1 } as Chapter, { number: 2 } as Chapter] } as TextInfo]
    } as SFProject);
    when(mockProjectService.getUserConfig(anything(), anything())).thenResolve({
      changes$: of([]) as Observable<OtJson0Op[]>,
      data: { selectedBookNum: 40, selectedChapterNum: 2 } as SFProjectUserConfig
    } as SFProjectUserConfigDoc);
    activatedProjectChange$.next({
      data: {
        texts: [{ bookNum: 40, chapters: [{ number: 1 } as Chapter, { number: 2 } as Chapter] } as TextInfo]
      } as SFProjectProfile
    } as SFProjectProfileDoc);

    await service['updateProjectUserConfig']('project01');
  });

  it('should create link from stored user config', fakeAsync(async () => {
    let result: string[] | undefined;
    service.resumeLink$.subscribe(link => {
      result = link;
    });

    tick(1); // Account for the delay(0)

    expect(result).toEqual(['/projects', 'project01', 'translate', 'MAT', '2']);

    flush();
  }));

  it('should create link using first book if no user config exists', fakeAsync(async () => {
    when(mockProjectService.getUserConfig(anything(), anything())).thenResolve({
      changes$: of([]) as Observable<OtJson0Op[]>
    } as SFProjectUserConfigDoc);

    await service['updateProjectUserConfig']('project01');

    let result: string[] | undefined;
    service.resumeLink$.subscribe(link => {
      result = link;
    });

    tick(1); // Account for the delay(0)

    expect(result).toEqual(['/projects', 'project01', 'translate', 'MAT', '1']);

    flush();
  }));

  it('should return empty array if project id is null', fakeAsync(() => {
    when(mockActivatedProjectService.projectId).thenReturn(undefined);

    const result = service['getProjectLink']('translate', ['GEN', '1']);

    expect(result).toEqual([]);
  }));
});
