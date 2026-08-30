import { DebugElement } from '@angular/core';
import { ComponentFixture, discardPeriodicTasks, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, Params } from '@angular/router';
import { User } from 'realtime-server/lib/esm/common/models/user';
import { createTestUser } from 'realtime-server/lib/esm/common/models/user-test-data';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { of } from 'rxjs';
import { anything, mock, when } from 'ts-mockito';
import { AuthService } from 'xforge-common/auth.service';
import { L10nPercentPipe } from 'xforge-common/l10n-percent.pipe';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { provideTestOnlineStatus } from 'xforge-common/test-online-status-providers';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { provideTestRealtime } from 'xforge-common/test-realtime-providers';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, getTestTranslocoModule } from 'xforge-common/test-utils';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { ProgressService, ProjectProgress } from '../../shared/progress-service/progress.service';
import { FontUnsupportedMessageComponent } from '../font-unsupported-message/font-unsupported-message.component';
import { TranslateOverviewComponent } from './translate-overview.component';

const mockedActivatedRoute = mock(ActivatedRoute);
const mockedAuthService = mock(AuthService);
const mockedNoticeService = mock(NoticeService);
const mockedUserService = mock(UserService);
const mockedProgressService = mock(ProgressService);

describe('TranslateOverviewComponent', () => {
  configureTestingModule(() => ({
    imports: [TranslateOverviewComponent, getTestTranslocoModule(), FontUnsupportedMessageComponent, L10nPercentPipe],
    providers: [
      provideTestOnlineStatus(),
      provideTestRealtime(SF_TYPE_REGISTRY),
      { provide: ActivatedRoute, useMock: mockedActivatedRoute },
      { provide: AuthService, useMock: mockedAuthService },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: UserService, useMock: mockedUserService },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService },
      { provide: ProgressService, useMock: mockedProgressService }
    ]
  }));

  it('should display a notice if offline', fakeAsync(() => {
    const env = new TestEnvironment();
    env.wait();

    // Verify message hidden if offline
    expect(env.offlineNotice).toBeNull();
    expect(env.booksCard).toBeTruthy();

    // Go offline
    env.isOnline = false;
    expect(env.offlineNotice).toBeTruthy();
    expect(env.booksCard).toBeNull();

    discardPeriodicTasks();
  }));

  it('progress card should list all books in project', fakeAsync(() => {
    const env = new TestEnvironment();
    env.wait();

    expect(env.progressTitle.textContent).toContain('Progress');
    expect(env.component.projectProgress?.books.length).toEqual(4);
    env.expectContainsTextProgress(0, 'Matthew', '10 of 20 segments');
    env.expectContainsTextProgress(1, 'Mark', '10 of 20 segments');
    env.expectContainsTextProgress(2, 'Luke', '10 of 20 segments');
    env.expectContainsTextProgress(3, 'John', '10 of 20 segments');

    discardPeriodicTasks();
  }));
});

class TestEnvironment {
  readonly component: TranslateOverviewComponent;
  readonly fixture: ComponentFixture<TranslateOverviewComponent>;

  readonly testOnlineStatusService: TestOnlineStatusService = TestBed.inject(
    OnlineStatusService
  ) as TestOnlineStatusService;

  private readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

  constructor() {
    const params = { ['projectId']: 'project01' } as Params;
    when(mockedActivatedRoute.params).thenReturn(of(params));
    when(mockedActivatedRoute.snapshot).thenReturn({} as any); // just needs to not be null/undefined
    when(mockedProgressService.getProgress(anything(), anything())).thenResolve(
      new ProjectProgress([
        { bookId: 'MAT', verseSegments: 20, blankVerseSegments: 10 },
        { bookId: 'MRK', verseSegments: 20, blankVerseSegments: 10 },
        { bookId: 'LUK', verseSegments: 20, blankVerseSegments: 10 },
        { bookId: 'JHN', verseSegments: 20, blankVerseSegments: 10 }
      ])
    );

    this.setCurrentUser();

    this.fixture = TestBed.createComponent(TranslateOverviewComponent);
    this.component = this.fixture.componentInstance;
    this.setupProjectData();
    this.setupUserData();
  }

  get offlineNotice(): HTMLElement {
    return this.fixture.nativeElement.querySelector('app-notice[icon="cloud_off"]');
  }

  get booksCard(): DebugElement {
    return this.fixture.debugElement.query(By.css('.books-card'));
  }

  get progressTextList(): HTMLElement {
    return this.fixture.nativeElement.querySelector('mat-list');
  }

  get progressTitle(): HTMLElement {
    return this.fixture.nativeElement.querySelector('#translate-overview-title');
  }

  set isOnline(value: boolean) {
    this.testOnlineStatusService.setIsOnline(value);
    this.wait();
  }

  setCurrentUser(userId: string = 'user01'): void {
    when(mockedUserService.currentUserId).thenReturn(userId);
    when(mockedUserService.getCurrentUser()).thenCall(() => this.realtimeService.subscribe(UserDoc.COLLECTION, userId));
  }

  wait(): void {
    this.fixture.detectChanges();
    tick();
    this.fixture.detectChanges();
  }

  // Some project doc changes are throttled by 1000 ms, so we have to wait for them
  waitForProjectDocChanges(): void {
    tick(1000);
    this.wait();
  }

  expectContainsTextProgress(index: number, primary: string, secondary: string): void {
    const items: NodeListOf<Element> = this.progressTextList.querySelectorAll('mat-list-item');
    const item: Element = items.item(index);
    const primaryElem: Element = item.querySelectorAll('.mat-mdc-list-item-title')[0];
    expect(primaryElem.textContent).toBe(primary);
    const secondaryElem: Element = item.querySelectorAll('.mat-mdc-list-item-line')[0];
    expect(secondaryElem.textContent).toBe(secondary);
  }

  setupProjectData(): void {
    this.realtimeService.addSnapshot<SFProjectProfile>(SFProjectProfileDoc.COLLECTION, {
      id: 'project01',
      data: createTestProjectProfile({
        userRoles: {
          user01: SFProjectRole.ParatextTranslator
        }
      })
    });
  }

  setupUserData(userId: string = 'user01', projects: string[] = ['project01']): void {
    this.realtimeService.addSnapshot<User>(UserDoc.COLLECTION, {
      id: userId,
      data: createTestUser({
        sites: {
          sf: {
            projects
          }
        }
      })
    });
  }
}
