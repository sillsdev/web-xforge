import { fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { ActivatedRouteSnapshot, NavigationEnd, Params, Router } from '@angular/router';
import { OtJson0Op } from 'ot-json0';
import { Json0OpBuilder } from 'realtime-server/lib/esm/common/utils/json0-op-builder';
import { Answer } from 'realtime-server/lib/esm/scriptureforge/models/answer';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { SFProjectUserConfig } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config';
import { Chapter, TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { anything, instance, mock, resetCalls, verify, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { UserService } from 'xforge-common/user.service';
import { QuestionDoc } from '../../core/models/question-doc';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SFProjectUserConfigDoc } from '../../core/models/sf-project-user-config-doc';
import { PermissionsService } from '../../core/permissions.service';
import { SFProjectService } from '../../core/sf-project.service';
import { CheckingQuestionsService } from './checking-questions.service';
import { ResumeCheckingService } from './resume-checking.service';

describe('ResumeCheckingService', () => {
  const mockRouter = mock(Router);
  const mockUserService = mock(UserService);
  const mockActivatedProjectService = mock(ActivatedProjectService);
  const mockOnlineStatusService = mock(OnlineStatusService);
  const mockProjectService = mock(SFProjectService);
  const mockPermissionsService = mock(PermissionsService);
  const mockQuestionsService = mock(CheckingQuestionsService);

  let service: ResumeCheckingService;
  let activatedProjectChange$: BehaviorSubject<SFProjectProfileDoc>;
  let routerEvents$: BehaviorSubject<any>;

  configureTestingModule(() => ({
    providers: [
      { provide: Router, useMock: mockRouter },
      { provide: UserService, useMock: mockUserService },
      { provide: ActivatedProjectService, useMock: mockActivatedProjectService },
      { provide: OnlineStatusService, useMock: mockOnlineStatusService },
      { provide: SFProjectService, useMock: mockProjectService },
      { provide: PermissionsService, useMock: mockPermissionsService },
      { provide: CheckingQuestionsService, useMock: mockQuestionsService }
    ]
  }));

  beforeEach(async () => {
    resetCalls(mockRouter);
    resetCalls(mockUserService);
    resetCalls(mockActivatedProjectService);
    resetCalls(mockOnlineStatusService);
    resetCalls(mockProjectService);
    resetCalls(mockPermissionsService);
    resetCalls(mockQuestionsService);

    activatedProjectChange$ = new BehaviorSubject<SFProjectProfileDoc>({} as SFProjectProfileDoc);
    routerEvents$ = new BehaviorSubject<any>({});

    when(mockActivatedProjectService.projectId).thenReturn('project01');
    when(mockActivatedProjectService.projectId$).thenReturn(of('project01'));
    when(mockActivatedProjectService.changes$).thenReturn(activatedProjectChange$);

    when(mockRouter.routerState).thenReturn({ snapshot: { root: {} as any } } as any);
    when(mockRouter.events).thenReturn(routerEvents$);

    when(mockUserService.currentUserId).thenReturn('user01');
    when(mockProjectService.getUserConfig(anything(), anything())).thenResolve({
      changes$: of([]) as Observable<OtJson0Op[]>,
      data: {} as SFProjectUserConfig
    } as SFProjectUserConfigDoc);

    service = TestBed.inject(ResumeCheckingService);

    activatedProjectChange$.next({
      id: 'project01',
      data: {
        userRoles: { user01: SFProjectRole.ParatextAdministrator } as any,
        texts: [{ bookNum: 40, chapters: [{ number: 1 } as Chapter, { number: 2 } as Chapter] } as TextInfo]
      } as SFProjectProfile
    } as SFProjectProfileDoc);

    const questions = [
      {
        data: { verseRef: { bookNum: 2, chapterNum: 2 }, answers: [{ ownerRef: 'user01' }] as Answer[] }
      } as QuestionDoc,
      {
        data: { verseRef: { bookNum: 2, chapterNum: 3 }, answers: [{ ownerRef: 'other' }] as Answer[] }
      } as QuestionDoc
    ];
    setUpQuestions(questions);

    await service['updateProjectUserConfig']('project01');
  });

  it('should create link using last location if it is present', fakeAsync(async () => {
    when(mockProjectService.getUserConfig(anything(), anything())).thenResolve({
      changes$: of([]) as Observable<OtJson0Op[]>,
      data: { selectedBookNum: 40, selectedChapterNum: 2 } as SFProjectUserConfig
    } as SFProjectUserConfigDoc);

    await service['updateProjectUserConfig']('project01');

    let result: string[] | undefined;
    service.resumeLink$.subscribe(link => {
      result = link;
    });

    tick(1); // Account for the delay(0)

    expect(result).toEqual(['projects', 'project01', 'checking', 'MAT', '2']);
    flush();
  }));

  it('should create link using first unanswered question if last location is invalid', fakeAsync(async () => {
    when(mockProjectService.getUserConfig(anything(), anything())).thenResolve({
      changes$: of([]) as Observable<OtJson0Op[]>,
      data: { selectedBookNum: 5, selectedChapterNum: 2 } as SFProjectUserConfig
    } as SFProjectUserConfigDoc);
    setUpQuestions([
      {
        data: { verseRef: { bookNum: 2, chapterNum: 2 }, answers: [{ ownerRef: 'user01' }] as Answer[] }
      } as QuestionDoc,
      {
        data: { verseRef: { bookNum: 2, chapterNum: 3 }, answers: [{ ownerRef: 'user02' }] as Answer[] }
      } as QuestionDoc
    ]);

    await service['updateProjectUserConfig']('project01');

    let result: string[] | undefined;
    service.resumeLink$.subscribe(link => {
      result = link;
    });

    tick(1); // Account for the delay(0)

    expect(result).toEqual(['projects', 'project01', 'checking', 'EXO', '3']);
    flush();
  }));

  it('should create link using first unanswered question if no last location', fakeAsync(async () => {
    let result: string[] | undefined;
    service.resumeLink$.subscribe(link => {
      result = link;
    });

    tick(1); // Account for the delay(0)

    expect(result).toEqual(['projects', 'project01', 'checking', 'EXO', '3']);
    flush();
  }));

  // at time of writing, the only way this use case is possible is if the user has answered all questions and the book
  // containing their most recently active question was deleted
  it('should create link using first question if neither last location nor unanswered question', fakeAsync(async () => {
    setUpQuestions([
      {
        data: { verseRef: { bookNum: 2, chapterNum: 2 }, answers: [{ ownerRef: 'user01' }] as Answer[] }
      } as QuestionDoc,
      {
        data: { verseRef: { bookNum: 2, chapterNum: 3 }, answers: [{ ownerRef: 'user01' }] as Answer[] }
      } as QuestionDoc
    ]);

    await service['updateProjectUserConfig']('project01');

    let result: string[] | undefined;
    service.resumeLink$.subscribe(link => {
      result = link;
    });

    tick(1); // Account for the delay(0)

    expect(result).toEqual(['projects', 'project01', 'checking', 'EXO', '2']);
    flush();
  }));

  it('should create link using first chapter if neither last location nor any question', fakeAsync(async () => {
    setUpQuestions([]);

    await service['updateProjectUserConfig']('project01');

    let result: string[] | undefined;
    service.resumeLink$.subscribe(link => {
      result = link;
    });

    tick(1); // Account for the delay(0)

    expect(result).toEqual(['projects', 'project01', 'checking', 'MAT', '1']);
    flush();
  }));

  it('should update user config when currentParams$ changes during checking', fakeAsync(async () => {
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

    when(mockRouter.url).thenReturn('/projects/project01/checking');
    when(mockRouter.routerState).thenReturn({
      snapshot: {
        root: { firstChild: { params: { bookId: 'MRK', chapter: '23' } as Params } as ActivatedRouteSnapshot }
      }
    } as any);
    routerEvents$.next(new NavigationEnd(-1, '', '')); // Trigger route change

    verify(userConfigDoc.submitJson0Op(anything())).once();
    expect(opsSets.length).toEqual(3);
    expect(opsSets[0].path).toContain('puc.selectedTask');
    expect(opsSets[0].value).toEqual('checking');
    expect(opsSets[1].path).toContain('puc.selectedBookNum');
    expect(opsSets[1].value).toEqual(41);
    expect(opsSets[2].path).toContain('puc.selectedChapterNum');
    expect(opsSets[2].value).toEqual(23);
  }));

  function setUpQuestions(newLocal: QuestionDoc[]): void {
    const query: RealtimeQuery<QuestionDoc> = mock(RealtimeQuery);
    when(query.ready$).thenReturn(of(true));
    when(query.remoteChanges$).thenReturn(of(undefined));
    when(query.localChanges$).thenReturn(of(undefined));
    when(query.remoteDocChanges$).thenReturn(of(undefined));
    when(query.docs).thenReturn(newLocal);
    when(query.dispose()).thenReturn();
    when(mockQuestionsService.queryQuestions(anything(), anything(), anything())).thenResolve(instance(query));
  }
});
