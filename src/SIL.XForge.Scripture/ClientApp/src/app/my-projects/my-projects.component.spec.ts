import { HttpClientTestingModule } from '@angular/common/http/testing';
import { DebugElement } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NavigationExtras, Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { of } from 'rxjs';
import { mock, objectContaining, when } from 'ts-mockito';
import { NoticeService } from 'xforge-common/notice.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SFUserProjectsService } from 'xforge-common/user-projects.service';
import { UserService } from 'xforge-common/user.service';
import { ParatextProject } from '../core/models/paratext-project';
import { SFProjectProfileDoc } from '../core/models/sf-project-profile-doc';
import { ParatextService } from '../core/paratext.service';
import { MyProjectsComponent } from './my-projects.component';

const mockedNoticeService = mock(NoticeService);
const mockedUserService = mock(UserService);
const mockedUserProjectsService = mock(SFUserProjectsService);
const mockedParatextService = mock(ParatextService);

describe('MyProjectsComponent', () => {
  configureTestingModule(() => ({
    declarations: [MyProjectsComponent],
    imports: [HttpClientTestingModule, UICommonModule, RouterTestingModule, TestTranslocoModule],
    providers: [
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: UserService, useMock: mockedUserService },
      { provide: ParatextService, useMock: mockedParatextService },
      { provide: SFUserProjectsService, useMock: mockedUserProjectsService }
    ]
  }));

  it('click Open connected project, goes to project', fakeAsync(() => {
    const env = new TestEnvironment({});

    const ptProjectId = env.projectProfileDocs[0].data!.paratextId;
    const sfProjectId = env.projectProfileDocs[0].id;
    flush();
    env.fixture.detectChanges();

    spyOn(env.router, 'navigateByUrl');
    env.click(env.goButtonForProject(ptProjectId));
    env.assertNavigatedTo(`projects/${sfProjectId}`);
  }));

  it('click Connect, passes PT project id', fakeAsync(() => {
    const env = new TestEnvironment({});
    flush();
    env.fixture.detectChanges();

    spyOn(env.router, 'navigateByUrl');
    env.click(env.goButtonForProject('pt-notConnToSF'));
    // Navigates to the connect project component.
    const navigationExtras = env.assertNavigatedTo('connect-project');
    // Passes PT project id to connect project component.
    expect(navigationExtras.state?.ptProjectId).toEqual('pt-notConnToSF');
  }));

  it('lists my connected projects', fakeAsync(() => {
    const env = new TestEnvironment({});
    flush();
    env.fixture.detectChanges();

    expect(env.cardForUserConnectedProject(env.projectProfileDocs[0].data!.paratextId)).not.toBeNull();
    expect(env.cardForUserConnectedProject(env.projectProfileDocs[1].data!.paratextId)).not.toBeNull();
    // Show whether the test works, too.
    expect(env.cardForUserConnectedProject('unknown-pt-id')).toBeNull();
  }));

  it('lists my PT projects that are not on SF', fakeAsync(() => {
    const env = new TestEnvironment({});
    flush();
    env.fixture.detectChanges();

    // These should not show as this-user-connected SF projects.
    expect(env.cardForUserConnectedProject('pt-notConnToSF')).toBeNull();
    expect(env.cardForUserConnectedProject('pt-notConnToSFAndUserIsTran')).toBeNull();

    // But they should show as projects that are not connected to this user on SF.
    expect(env.cardForUserUnconnectedProject('pt-notConnToSF')).not.toBeNull();
    expect(env.cardForUserUnconnectedProject('pt-notConnToSFAndUserIsTran')).not.toBeNull();
  }));

  it('lists my PT projects that are on SF but that I am not connected to on SF', fakeAsync(() => {
    const env = new TestEnvironment({});
    flush();
    env.fixture.detectChanges();

    // These should not show as this-user-connected SF projects.
    expect(env.cardForUserConnectedProject('pt-connButNotThisUser')).toBeNull();

    // But they should show as projects that are not connected to this user on SF.
    expect(env.cardForUserUnconnectedProject('pt-connButNotThisUser')).not.toBeNull();
  }));

  it('lists my connected resources', fakeAsync(() => {
    const env = new TestEnvironment({});
    flush();
    env.fixture.detectChanges();

    expect(env.cardForUserConnectedResource('resource90123456')).not.toBeNull();
    // Show whether the test works, too.
    expect(env.cardForUserConnectedResource('unknown-res-id00')).toBeNull();
  }));

  it('project that is on SF but not this-user-connected shows Join button', fakeAsync(() => {
    const env = new TestEnvironment({});
    flush();
    env.fixture.detectChanges();

    expect(env.goButtonForProject('pt-connButNotThisUser').nativeElement.textContent).toContain('Join');
  }));

  it('project that is not on SF shows Connect button', fakeAsync(() => {
    const env = new TestEnvironment({});
    flush();
    env.fixture.detectChanges();

    expect(env.goButtonForProject('pt-notConnToSF').nativeElement.textContent).toContain('Connect');
  }));

  it('project that is not on SF, and that user is only a Translator for, should show guide message and not Connect button', fakeAsync(() => {
    const env = new TestEnvironment({});
    flush();
    env.fixture.detectChanges();

    // There should not be a connect/join/open button.
    expect(env.goButtonForProject('pt-notConnToSFAndUserIsTran')).toBeNull();
    // The card should show a guiding message.
    env
      .cardForUserUnconnectedProject('pt-notConnToSFAndUserIsTran')
      .nativeElement.textContent.includes('only_paratext_admins_can_start');
  }));

  it('guides user when user has no known SF or PT projects', fakeAsync(() => {
    const env = new TestEnvironment({ userHasPTProjects: false });
    flush();
    env.fixture.detectChanges();

    expect(env.noPTOrSFProjectsNotice).not.toBeNull();
  }));

  it('does not guide user with no-projects information if user has projects', fakeAsync(() => {
    const env = new TestEnvironment({});
    flush();
    env.fixture.detectChanges();

    expect(env.noPTOrSFProjectsNotice).toBeNull();
  }));
});

class TestEnvironment {
  readonly component: MyProjectsComponent;
  readonly fixture: ComponentFixture<MyProjectsComponent>;
  readonly router: Router;

  /** SF projects the user is connected to. */
  projectProfileDocs: SFProjectProfileDoc[] = [];
  /** PT projects the user has access to. */
  userParatextProjects: ParatextProject[] = [];

  constructor({ userHasPTProjects = true }: { userHasPTProjects?: boolean }) {
    if (userHasPTProjects) {
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

    this.router = TestBed.inject(Router);
    this.fixture = TestBed.createComponent(MyProjectsComponent);
    this.component = this.fixture.componentInstance;
  }

  get noPTOrSFProjectsNotice(): DebugElement {
    return this.getElement('#no-pt-or-sf-projects');
  }

  click(element: DebugElement): void {
    element.nativeElement.click();
    tick();
    this.fixture.detectChanges();
  }

  assertNavigatedTo(url: string): NavigationExtras {
    const mostRecentCallArgs = (this.router.navigateByUrl as jasmine.Spy).calls.mostRecent().args;
    const urlSegments = mostRecentCallArgs[0].root.children.primary.segments;
    const navigatedUrl = urlSegments.map((s: any) => s.path).join('/');
    expect(navigatedUrl).toEqual(url);
    const navigationExtras = mostRecentCallArgs[1];
    return navigationExtras;
  }

  /** Main button on card, like Open, Connect, or Join. */
  goButtonForProject(ptProjectId: string): DebugElement {
    return this.getElement(`[id*="-card-${ptProjectId}"] a`);
  }

  cardForUserConnectedProject(ptProjectId: string): DebugElement {
    return this.getElement(`#user-connected-project-card-${ptProjectId}`);
  }

  cardForUserUnconnectedProject(ptProjectId: string): DebugElement {
    return this.getElement(`#user-unconnected-project-card-${ptProjectId}`);
  }

  cardForUserConnectedResource(ptProjectId: string): DebugElement {
    return this.getElement(`#user-connected-resource-card-${ptProjectId}`);
  }

  private getElement(query: string): DebugElement {
    return this.fixture.debugElement.query(By.css(query));
  }
}
