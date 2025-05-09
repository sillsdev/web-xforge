import { fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { ActivatedRouteSnapshot, NavigationEnd, Params, Router } from '@angular/router';
import { OtJson0Op } from 'ot-json0';
import { Json0OpBuilder } from 'realtime-server/lib/esm/common/utils/json0-op-builder';
import { SFProject, SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectUserConfig } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config';
import { Chapter, TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { anything, instance, mock, resetCalls, verify, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { configureTestingModule } from 'xforge-common/test-utils';
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
  let routerEvents$: BehaviorSubject<any>;

  configureTestingModule(() => ({
    providers: [
      { provide: Router, useMock: mockRouter },
      { provide: UserService, useMock: mockUserService },
      { provide: ActivatedProjectService, useMock: mockActivatedProjectService },
      { provide: OnlineStatusService, useMock: mockOnlineStatusService },
      { provide: SFProjectService, useMock: mockProjectService },
      { provide: PermissionsService, useMock: mockPermissionsService }
    ]
  }));

  beforeEach(async () => {
    resetCalls(mockRouter);
    resetCalls(mockUserService);
    resetCalls(mockActivatedProjectService);
    resetCalls(mockOnlineStatusService);
    resetCalls(mockProjectService);
    resetCalls(mockPermissionsService);

    activatedProjectChange$ = new BehaviorSubject<SFProjectProfileDoc>({} as SFProjectProfileDoc);
    routerEvents$ = new BehaviorSubject<any>({});

    mockedProjectDoc = mock(SFProjectDoc);

    when(mockActivatedProjectService.projectId).thenReturn('project01');
    when(mockActivatedProjectService.projectId$).thenReturn(of('project01'));
    when(mockActivatedProjectService.changes$).thenReturn(activatedProjectChange$);

    when(mockRouter.routerState).thenReturn({ snapshot: { root: {} as any } } as any);
    when(mockRouter.events).thenReturn(routerEvents$);

    service = TestBed.inject(ResumeTranslateService);

    when(mockedProjectDoc.data).thenReturn({
      texts: [{ bookNum: 40, chapters: [{ number: 1 } as Chapter, { number: 2 } as Chapter] } as TextInfo]
    } as SFProject);
    when(mockProjectService.getUserConfig(anything(), anything(), anything())).thenResolve({
      changes$: of([]) as Observable<OtJson0Op[]>,
      data: { selectedTask: 'checking', selectedBookNum: 40, selectedChapterNum: 2 } as SFProjectUserConfig
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

  it('should create link using first book if last location is invalid', fakeAsync(async () => {
    when(mockProjectService.getUserConfig(anything(), anything(), anything())).thenResolve({
      changes$: of([]) as Observable<OtJson0Op[]>,
      data: { selectedTask: 'checking', selectedBookNum: 6, selectedChapterNum: 2 } as SFProjectUserConfig
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

  it('should create link using first book if no user config exists', fakeAsync(async () => {
    when(mockProjectService.getUserConfig(anything(), anything(), anything())).thenResolve({
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

    const result = service['getProjectLink'](['GEN', '1']);

    expect(result).toEqual([]);
  }));

  it('should update user config when currentParams$ changes', fakeAsync(async () => {
    const userConfigDoc = mock(SFProjectUserConfigDoc);
    const opsSets: { path: string; value: any }[] = [];
    when(userConfigDoc.submitJson0Op(anything())).thenCall((fn: (op: Json0OpBuilder<SFProjectUserConfig>) => void) => {
      fn({
        set: (path: any, value: any) => {
          opsSets.push({ path: path.toString(), value });
        }
      } as Json0OpBuilder<SFProjectUserConfig>);
    });

    service['projectUserConfigDoc$'].next(instance(userConfigDoc));

    when(mockRouter.url).thenReturn('/projects/project01/translate');
    when(mockRouter.routerState).thenReturn({
      snapshot: {
        root: { firstChild: { params: { bookId: 'MRK', chapter: '23' } as Params } as ActivatedRouteSnapshot }
      }
    } as any);
    routerEvents$.next(new NavigationEnd(-1, '', '')); // Trigger route change

    verify(userConfigDoc.submitJson0Op(anything())).once();
    expect(opsSets.length).toEqual(3);
    expect(opsSets[0].path).toContain('puc.selectedTask');
    expect(opsSets[0].value).toEqual('translate');
    expect(opsSets[1].path).toContain('puc.selectedBookNum');
    expect(opsSets[1].value).toEqual(41);
    expect(opsSets[2].path).toContain('puc.selectedChapterNum');
    expect(opsSets[2].value).toEqual(23);
  }));
});
