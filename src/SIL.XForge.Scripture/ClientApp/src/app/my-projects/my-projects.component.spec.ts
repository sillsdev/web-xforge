import { HttpClientTestingModule } from '@angular/common/http/testing';
import { Component, DebugElement } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { Router, RouterModule } from '@angular/router';
import { User } from 'realtime-server/lib/esm/common/models/user';
import { createTestUser } from 'realtime-server/lib/esm/common/models/user-test-data';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { of } from 'rxjs';
import { mock, objectContaining, verify, when } from 'ts-mockito';
import { UserDoc } from 'xforge-common/models/user-doc';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SFUserProjectsService } from 'xforge-common/user-projects.service';
import { UserService } from 'xforge-common/user.service';
import { ParatextProject } from '../core/models/paratext-project';
import { SFProjectProfileDoc } from '../core/models/sf-project-profile-doc';
import { ParatextService } from '../core/paratext.service';
import { SharedModule } from '../shared/shared.module';
import { MyProjectsComponent } from './my-projects.component';

@Component({ template: '' })
class EmptyComponent {}

const mockedUserService = mock(UserService);
const mockedUserProjectsService = mock(SFUserProjectsService);
const mockedParatextService = mock(ParatextService);

describe('MyProjectsComponent', () => {
  configureTestingModule(() => ({
    declarations: [MyProjectsComponent],
    imports: [
      HttpClientTestingModule,
      UICommonModule,
      SharedModule,
      RouterModule.forRoot([
        { path: 'projects/:projectId', component: EmptyComponent },
        { path: 'connect-project', component: EmptyComponent }
      ]),
      TestOnlineStatusModule.forRoot(),
      TestTranslocoModule
    ],
    providers: [
      provideAnimations(),
      { provide: UserService, useMock: mockedUserService },
      { provide: ParatextService, useMock: mockedParatextService },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService },
      { provide: SFUserProjectsService, useMock: mockedUserProjectsService }
    ]
  }));

  it('click Open connected project, goes to project', fakeAsync(() => {
    const env = new TestEnvironment();
    const sfProjectId = 'testProject1';
    const ptProjectId = env.projectProfileDocs.find((proj: SFProjectProfileDoc) => proj.id === sfProjectId)!.data!
      .paratextId;
    env.waitUntilLoaded();

    env.click(env.goButtonForProject(ptProjectId));
    // Navigates to desired project.
    expect(env.router.url).toEqual(`/projects/${sfProjectId}`);
  }));

  it('click Connect, passes PT project id', fakeAsync(() => {
    const env = new TestEnvironment();
    env.waitUntilLoaded();

    env.click(env.goButtonForProject('pt-notConnToSF'));
    // Navigates to the connect project component.
    expect(env.router.url).toEqual('/connect-project');
    // Passes PT project id to connect project component.
    expect(env.router.lastSuccessfulNavigation?.extras.state?.ptProjectId).toEqual('pt-notConnToSF');
  }));

  it('lists my connected projects', fakeAsync(() => {
    const env = new TestEnvironment();
    env.waitUntilLoaded();

    // Cards for this user's connected projects are shown.
    expect(
      env.cardForUserConnectedProject(
        env.projectProfileDocs.find((proj: SFProjectProfileDoc) => proj.id === 'testProject1')!.data!.paratextId
      )
    ).not.toBeNull();
    expect(
      env.cardForUserConnectedProject(
        env.projectProfileDocs.find((proj: SFProjectProfileDoc) => proj.id === 'testProject2')!.data!.paratextId
      )
    ).not.toBeNull();
    // Show whether the test works, too.
    expect(env.cardForUserConnectedProject('unknown-pt-id')).toBeNull();
  }));

  it('lists my PT projects that are not on SF', fakeAsync(() => {
    const env = new TestEnvironment();
    env.waitUntilLoaded();

    // These should not show as this-user-connected SF projects.
    expect(env.cardForUserConnectedProject('pt-notConnToSF')).toBeNull();
    expect(env.cardForUserConnectedProject('pt-notConnToSFAndUserIsTran')).toBeNull();

    // But they should show as projects that are not connected to this user on SF.
    expect(env.cardForUserUnconnectedProject('pt-notConnToSF')).not.toBeNull();
    expect(env.cardForUserUnconnectedProject('pt-notConnToSFAndUserIsTran')).not.toBeNull();
  }));

  it('lists my PT projects that are on SF but that I am not connected to on SF', fakeAsync(() => {
    const env = new TestEnvironment();
    env.waitUntilLoaded();

    // These should not show as this-user-connected SF projects.
    expect(env.cardForUserConnectedProject('pt-connButNotThisUser')).toBeNull();

    // But they should show as projects that are not connected to this user on SF.
    expect(env.cardForUserUnconnectedProject('pt-connButNotThisUser')).not.toBeNull();
  }));

  it('lists my connected resources', fakeAsync(() => {
    const env = new TestEnvironment();
    env.waitUntilLoaded();

    // Card for resource this user is using on SF is shown.
    expect(env.cardForUserConnectedResource('resource90123456')).not.toBeNull();
    // Show whether the test works, too.
    expect(env.cardForUserConnectedResource('unknown-res-id56')).toBeNull();
  }));

  it('a project that is on SF but not this-user-connected shows Join button', fakeAsync(() => {
    const env = new TestEnvironment();
    env.waitUntilLoaded();

    expect(env.goButtonForProject('pt-connButNotThisUser').nativeElement.textContent).toContain('Join');
  }));

  it('a project that is not on SF shows Connect button', fakeAsync(() => {
    const env = new TestEnvironment();
    env.waitUntilLoaded();

    expect(env.goButtonForProject('pt-notConnToSF').nativeElement.textContent).toContain('Connect');
  }));

  it('a project that is not on SF, and that user is only a Translator for, should show guide message and not Connect button', fakeAsync(() => {
    const env = new TestEnvironment();
    env.waitUntilLoaded();

    // There should not be a connect/join/open button.
    expect(env.goButtonForProject('pt-notConnToSFAndUserIsTran')).toBeNull();
    // The card should show a guiding message.
    expect(
      env
        .cardForUserUnconnectedProject('pt-notConnToSFAndUserIsTran')
        .nativeElement.textContent.includes('ask the administrator')
    ).toBe(true);
  }));

  it('guides user when user has no known SF projects, and not a PT user', fakeAsync(() => {
    const env = new TestEnvironment({ userHasAnyProjects: false, isKnownPTUser: false });
    env.waitUntilLoaded();

    // Big banner guiding user is shown
    expect(env.messageNoPTOrSFProjects).not.toBeNull();
    // The subtle message about accessing another project should not be shown
    expect(env.messageLookingForAnotherProject).toBeNull();
    // We won't expect getProjects() to have been called.
    verify(mockedParatextService.getProjects()).never();
  }));

  it('guides user when user has no known SF or PT projects, when is logged into PT', fakeAsync(() => {
    const env = new TestEnvironment({ userHasAnyProjects: false });
    // Setup: User Paratext projects list is defined, but empty.
    expect(env.userParatextProjects).toEqual([]);
    env.waitUntilLoaded();

    // Big banner guiding user is shown
    expect(env.messageNoPTOrSFProjects).not.toBeNull();
    // The subtle message about accessing another project should not be shown
    expect(env.messageLookingForAnotherProject).toBeNull();
  }));

  it('does not guide user with no-projects information if user has projects', fakeAsync(() => {
    const env = new TestEnvironment();
    // Setup: User SF or Paratext projects list has items.
    expect(env.projectProfileDocs.length + env.userParatextProjects.length).toBeGreaterThan(0);
    env.waitUntilLoaded();

    // Big banner guiding user is not shown
    expect(env.messageNoPTOrSFProjects).toBeNull();
  }));

  it('does not tell the user there are no projects when the list from PT has not yet loaded', fakeAsync(() => {
    const env = new TestEnvironment({ userHasAnyProjects: false });
    let didCheckAtLoadingTime: boolean = false;

    // When the component is fetching the list of projects from Paratext, make sure "no projects" is not shown
    when(mockedParatextService.getProjects()).thenCall(() => {
      env.fixture.detectChanges();
      // During this time, we should not be showing the you-have-no-projects message.
      expect(env.messageNoPTOrSFProjects).toBeNull();
      didCheckAtLoadingTime = true;
      // Return the usual data.
      return env.userParatextProjects;
    });

    env.waitUntilLoaded();

    // Did the test check what was expected of it?
    expect(didCheckAtLoadingTime).toBe(true);
  }));

  it('trouble fetching the list of PT projects to connect to is gracefully handled', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedParatextService.getProjects()).thenReject(new Error('test error'));
    env.waitUntilLoaded();

    // Trouble message is shown.
    expect(env.messageTroubleGettingPTProjectList).not.toBeNull();
    // Show the header above it as well to make the context clear.
    expect(env.headerNotConnectedProjects).not.toBeNull();
    // Not throwing an exception.
  }));

  it('undefined result when fetching the list of PT projects to connect to is gracefully handled', fakeAsync(() => {
    const env = new TestEnvironment();
    // getProjects() may return undefined such as if the user is not logged into Paratext.
    when(mockedParatextService.getProjects()).thenResolve(undefined);
    env.waitUntilLoaded();

    // Trouble message is shown.
    expect(env.messageTroubleGettingPTProjectList).not.toBeNull();
    // Show the header above it as well to make the context clear.
    expect(env.headerNotConnectedProjects).not.toBeNull();
    // Not throwing an exception.
  }));

  it('trouble fetching the list of PT projects to connect to, does not show trouble message, if the user is offline', fakeAsync(() => {
    // Suppose the user is offline, and they visit this component. They will not be able to receive their PT projects
    // list from the server. But we don't need to show them the generic "There was a problem" message, because the real
    // issue is that they are _offline_.
    const env = new TestEnvironment();
    when(mockedParatextService.getProjects()).thenReject(new Error('test error'));
    env.onlineStatus = false;
    env.waitUntilLoaded();

    // The message is shown that tells the user about needing to be online.
    expect(env.messageOffline).not.toBeNull();
    // Trouble message is not shown.
    expect(env.messageTroubleGettingPTProjectList).toBeNull();
    // Not throwing an exception.
  }));

  it('fetch PT projects list if online', fakeAsync(() => {
    // Suppose the user is online and visit this component. We fetch and display PT projects.
    const env = new TestEnvironment();
    env.waitUntilLoaded();
    verify(mockedParatextService.getProjects()).once();
    // Unconnected project cards are shown
    expect(env.cardForUserUnconnectedProject('pt-notConnToSF')).not.toBeNull();
    // We are not showing a message about needing to be online.
    expect(env.messageOffline).toBeNull();
  }));

  it('fetches projects list when user comes online', fakeAsync(() => {
    // Suppose the user is offline, and they visit this component. Then they connect to the Internet. Fetch their list
    // of PT projects without them needing to leave and come back to this component.
    const env = new TestEnvironment();
    env.onlineStatus = false;
    env.waitUntilLoaded();

    // We are offline and don't even call getProjects yet.
    verify(mockedParatextService.getProjects()).never();
    // The message is shown that tells the user about needing to be online.
    expect(env.messageOffline).not.toBeNull();
    // Trouble message is not shown.
    expect(env.messageTroubleGettingPTProjectList).toBeNull();
    // Unconnected project cards are not shown
    expect(env.cardForUserUnconnectedProject('pt-notConnToSF')).toBeNull();
    // Not throwing an exception.

    // The user comes online.
    env.onlineStatus = true;
    // We are online and have called getProjects.
    verify(mockedParatextService.getProjects()).once();
    // Unconnected project cards are now shown
    expect(env.cardForUserUnconnectedProject('pt-notConnToSF')).not.toBeNull();
    // We are no longer showing a message about needing to be online.
    expect(env.messageOffline).toBeNull();
  }));

  it('Non-PT user is not told they are offline', fakeAsync(() => {
    // Suppose a non-PT user visits the page and is offline. They could potentially be told updated information if
    // online, such as if their project's source text changed to another resource, or if they were somehow added to a
    // project (via means other than an invitation somehow like directly editing the DB), or if they were removed from a
    // project. But most of the time the only _new_ thing that will appear on the My projects page is a result of
    // accepting an invitation to a project, or logging back in as a PT user. So don't bother to tell a non-PT user that
    // they are offline.
    const env = new TestEnvironment({ isKnownPTUser: false });
    env.onlineStatus = false;
    env.waitUntilLoaded();

    // We are offline.
    verify(mockedParatextService.getProjects()).never();
    // But we don't display the offline message to the non-PT user.
    expect(env.messageOffline).toBeNull();
  }));

  it('shows loading card while waiting for SF projects list', fakeAsync(() => {
    const env = new TestEnvironment();
    let didCheckAtLoadingTime: boolean = false;
    // When the component is fetching the SF project list, check that some UI elements are as desired.
    when(mockedUserProjectsService.projectDocs$).thenCall(() => {
      env.fixture.detectChanges();
      // While SF project list is being fetched, a loading card is shown.
      expect(env.sfLoadingCard).not.toBeNull();
      // Show the header above it as well to make it clear what is loading.
      expect(env.headerConnectedProjects).not.toBeNull();
      // During this time, we should not be showing the you-have-no-projects message.
      expect(env.messageNoPTOrSFProjects).toBeNull();
      didCheckAtLoadingTime = true;
      // Return the usual data.
      return of(env.projectProfileDocs);
    });
    env.waitUntilLoaded();

    // After SF project list is fetched, loading card is hidden.
    expect(env.sfLoadingCard).toBeNull();
    // Did the test check what was expected of it?
    expect(didCheckAtLoadingTime).toBe(true);
  }));

  it('shows loading card while waiting for PT projects list, if is PT user', fakeAsync(() => {
    const env = new TestEnvironment({ isKnownPTUser: true });
    let didCheckAtLoadingTime: boolean = false;
    // When the component is fetching the PT project list, check that some UI elements are as desired.
    when(mockedParatextService.getProjects()).thenCall(() => {
      env.fixture.detectChanges();
      // While PT project list is being fetched, a loading card is shown.
      expect(env.ptLoadingCard).not.toBeNull();
      // Show the header above it as well to make it clear what is loading.
      expect(env.headerNotConnectedProjects).not.toBeNull();
      didCheckAtLoadingTime = true;
      // Return the usual data.
      return env.userParatextProjects;
    });
    env.waitUntilLoaded();

    // After PT project list is fetched, loading card is hidden.
    expect(env.ptLoadingCard).toBeNull();
    // Did the test check what was expected of it?
    expect(didCheckAtLoadingTime).toBe(true);
    // And of course, getProjects() was called.
    verify(mockedParatextService.getProjects()).once();
  }));

  it('does not query PT projects list or show loading card for PT projects list, if is not a PT user', fakeAsync(() => {
    // Suppose a user views the page and is not a PT user. We should not make API calls to query PT projects, and we
    // should not show a loading card for the PT projects list.
    const env = new TestEnvironment({ isKnownPTUser: false });
    env.waitUntilLoaded();

    // The loading card for PT projects list should not be showing.
    expect(env.ptLoadingCard).toBeNull();
    // We won't have the not-connected-projects header.
    expect(env.headerNotConnectedProjects).toBeNull();
    // getProjects() should not have been called.
    verify(mockedParatextService.getProjects()).never();
  }));

  it('subtle message about accessing more projects', fakeAsync(() => {
    // Suppose a user logs in with a username and password and accepts an invitation to a project. If they don't use
    // Paratext, we don't need to tell them about logging back in with Paratext to connect projects. If they do use
    // Paratext (but didn't "Log in with Paratext"), they might be wondering how to open their Paratext projects. But we
    // can't really know which of these situations we are in. If the user is not logged in with Paratext, show a subtle
    // message about how to access more projects.
    const env = new TestEnvironment({ isKnownPTUser: false });
    // Setup: Only show the subtle message if there are _some_ projects that the user has access to. If the user has no
    // projects at all, then we show a different message.
    expect(env.projectProfileDocs.length).toBeGreaterThan(0);
    env.waitUntilLoaded();

    // Subtle message is shown.
    expect(env.messageLookingForAnotherProject).not.toBeNull();
    // The unconnected projects area shouldn't be shown.
    expect(env.headerNotConnectedProjects).toBeNull();
    // We won't expect getProjects() to have been called.
    verify(mockedParatextService.getProjects()).never();
  }));
});

class TestEnvironment {
  readonly component: MyProjectsComponent;
  readonly fixture: ComponentFixture<MyProjectsComponent>;
  readonly router: Router;
  readonly testOnlineStatusService: TestOnlineStatusService = TestBed.inject(
    OnlineStatusService
  ) as TestOnlineStatusService;

  /** SF projects the user is connected to. */
  projectProfileDocs: SFProjectProfileDoc[] = [];
  /** PT projects the user has access to. */
  userParatextProjects: ParatextProject[] = [];

  constructor({
    userHasAnyProjects = true,
    isKnownPTUser = true
  }: { userHasAnyProjects?: boolean; isKnownPTUser?: boolean } = {}) {
    if (userHasAnyProjects) {
      this.projectProfileDocs = [
        {
          id: 'testProject1',
          data: createTestProjectProfile({}, 1)
        },
        {
          id: 'testProject2',
          data: createTestProjectProfile({}, 2)
        },
        {
          id: 'testResource3',
          data: createTestProjectProfile(
            {
              paratextId: 'resource90123456',
              resourceConfig: {
                createdTimestamp: Date.now(),
                manifestChecksum: '123',
                permissionsChecksum: '123',
                revision: 1
              }
            },
            3
          )
        }
      ] as SFProjectProfileDoc[];

      this.userParatextProjects = [
        {
          name: 'Not connected at all to SF',
          projectId: undefined,
          shortName: 'NCAA',
          paratextId: 'pt-notConnToSF',
          isConnectable: true,
          isConnected: false
        },
        {
          name: 'Connected but not to this SF user',
          projectId: 'sf-cbntt',
          shortName: 'CBNTT',
          paratextId: 'pt-connButNotThisUser',
          isConnectable: true,
          isConnected: false
        },
        {
          name: 'Not connected at all to SF, and user is PT Translator not PT Administrator',
          projectId: undefined,
          shortName: 'NCAAUPT',
          paratextId: 'pt-notConnToSFAndUserIsTran',
          isConnectable: false,
          isConnected: false
        }
      ] as ParatextProject[];

      when(mockedParatextService.isParatextProjectInSF(objectContaining({ paratextId: 'pt-notConnToSF' }))).thenReturn(
        false
      );
      when(
        mockedParatextService.isParatextProjectInSF(objectContaining({ paratextId: 'pt-connButNotThisUser' }))
      ).thenReturn(true);
      when(
        mockedParatextService.isParatextProjectInSF(objectContaining({ paratextId: 'pt-notConnToSFAndUserIsTran' }))
      ).thenReturn(false);

      this.projectProfileDocs.forEach((projectProfileDoc: SFProjectProfileDoc) => {
        this.userParatextProjects.push({
          projectId: projectProfileDoc.id,
          name: projectProfileDoc.data!.name,
          shortName: projectProfileDoc.data!.shortName,
          paratextId: projectProfileDoc.data!.paratextId,
          isConnectable: true,
          isConnected: true
        } as ParatextProject);

        when(
          mockedParatextService.isParatextProjectInSF(
            objectContaining({ paratextId: projectProfileDoc.data!.paratextId })
          )
        ).thenReturn(true);
      });
    }

    when(mockedParatextService.getProjects()).thenResolve(this.userParatextProjects);
    when(mockedUserProjectsService.projectDocs$).thenReturn(of(this.projectProfileDocs));

    const user: User = createTestUser({
      paratextId: isKnownPTUser ? 'pt-user-id' : undefined,
      sites: {
        sf: {
          projects: []
        }
      }
    });
    const userDoc = { id: 'sf-user-id', data: user };
    when(mockedUserService.getCurrentUser()).thenResolve(userDoc as UserDoc);

    this.router = TestBed.inject(Router);
    this.fixture = TestBed.createComponent(MyProjectsComponent);
    this.component = this.fixture.componentInstance;
  }

  get messageNoPTOrSFProjects(): DebugElement {
    return this.getElement('#message-no-pt-or-sf-projects');
  }

  get messageTroubleGettingPTProjectList(): DebugElement {
    return this.getElement('#message-trouble-getting-pt-project-list');
  }

  get sfLoadingCard(): DebugElement {
    return this.getElement('#sf-loading-card');
  }

  get ptLoadingCard(): DebugElement {
    return this.getElement('#pt-loading-card');
  }

  get headerConnectedProjects(): DebugElement {
    return this.getElement('#header-connected-projects');
  }

  get headerNotConnectedProjects(): DebugElement {
    return this.getElement('#header-not-connected-projects');
  }

  get messageLookingForAnotherProject(): DebugElement {
    return this.getElement('#message-looking-for-another-project');
  }

  get messageOffline(): DebugElement {
    return this.getElement('#message-offline');
  }

  set onlineStatus(isOnline: boolean) {
    this.testOnlineStatusService.setIsOnline(isOnline);
    tick();
    this.fixture.detectChanges();
  }

  click(element: DebugElement): void {
    element.nativeElement.click();
    tick();
    this.fixture.detectChanges();
  }

  /** Main button on card, like Open, Connect, or Join. */
  goButtonForProject(ptProjectId: string): DebugElement {
    return this.getElement(`mat-card[data-pt-project-id=${ptProjectId}] > a`);
  }

  cardForUserConnectedProject(ptProjectId: string): DebugElement {
    return this.getElement(`mat-card[data-pt-project-id=${ptProjectId}][data-project-type="user-connected-project"]`);
  }

  cardForUserConnectedResource(ptProjectId: string): DebugElement {
    return this.getElement(`mat-card[data-pt-project-id=${ptProjectId}][data-project-type="user-connected-resource"]`);
  }

  cardForUserUnconnectedProject(ptProjectId: string): DebugElement {
    return this.getElement(`mat-card[data-pt-project-id=${ptProjectId}][data-project-type="user-unconnected-project"]`);
  }

  waitUntilLoaded(): void {
    // Two cycles can to be needed to finish working through loadParatextProjects().
    flush();
    this.fixture.detectChanges();
    flush();
    this.fixture.detectChanges();
  }

  private getElement(query: string): DebugElement {
    return this.fixture.debugElement.query(By.css(query));
  }
}
