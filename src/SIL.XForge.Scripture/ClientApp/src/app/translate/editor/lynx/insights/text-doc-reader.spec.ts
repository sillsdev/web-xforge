import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { BehaviorSubject, filter, take } from 'rxjs';
import { anything, mock, when } from 'ts-mockito';
import { ActivatedProjectService, ActiveProjectIdService } from 'xforge-common/activated-project.service';
import { DocSubscription } from 'xforge-common/models/realtime-doc';
import { configureTestingModule } from 'xforge-common/test-utils';
import { SFProjectProfileDoc } from '../../../../core/models/sf-project-profile-doc';
import { TextDoc, TextDocId } from '../../../../core/models/text-doc';
import { SFProjectService } from '../../../../core/sf-project.service';
import { TextDocReader } from './lynx-workspace.service';

const PROJECT_ID = 'project01';
const NEXT_PROJECT_ID = 'project02';
const mockedProjectService = mock(SFProjectService);

describe('TextDocReader', () => {
  let env: TestEnvironment;

  configureTestingModule(() => ({
    providers: [
      TextDocReader,
      ActivatedProjectService,
      { provide: ActiveProjectIdService, useFactory: () => new TestActiveProjectIdService() },
      { provide: SFProjectService, useMock: mockedProjectService }
    ]
  }));

  beforeEach(() => {
    env = new TestEnvironment();
  });

  it('should unsubscribe text doc subscriptions when the active project changes', fakeAsync(() => {
    const textDocId = new TextDocId(PROJECT_ID, 40, 1);

    env.activateProject(PROJECT_ID);
    tick();

    void env.reader.read(textDocId.toString());
    tick();

    expect(env.numTextDocUnsubscribes).toBe(0);

    env.activateProject(NEXT_PROJECT_ID);
    tick();

    expect(env.numTextDocUnsubscribes).toBe(1);
  }));
});

class TestEnvironment {
  readonly reader: TextDocReader;
  numTextDocUnsubscribes: number = 0;

  private readonly activeProjectIdService: TestActiveProjectIdService;

  constructor() {
    this.activeProjectIdService = TestBed.inject(ActiveProjectIdService) as unknown as TestActiveProjectIdService;
    this.reader = TestBed.inject(TextDocReader);

    when(mockedProjectService.getProfile(PROJECT_ID, anything())).thenResolve({
      id: PROJECT_ID
    } as SFProjectProfileDoc);
    when(mockedProjectService.getProfile(NEXT_PROJECT_ID, anything())).thenResolve({
      id: NEXT_PROJECT_ID
    } as SFProjectProfileDoc);
    when(mockedProjectService.getText(anything(), anything())).thenCall(
      async (_textId: TextDocId | string, subscriber: DocSubscription) => {
        subscriber.isUnsubscribed$
          .pipe(
            filter(isUnsubscribed => isUnsubscribed === true),
            take(1)
          )
          .subscribe(() => this.numTextDocUnsubscribes++);

        return {
          data: { ops: [] },
          adapter: { version: 1 }
        } as unknown as TextDoc;
      }
    );
  }

  activateProject(projectId: string | undefined): void {
    this.activeProjectIdService.projectId$.next(projectId);
  }
}

class TestActiveProjectIdService {
  readonly projectId$ = new BehaviorSubject<string | undefined>(undefined);
}
