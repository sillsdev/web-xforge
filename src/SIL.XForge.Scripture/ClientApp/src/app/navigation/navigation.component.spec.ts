import { DebugElement } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, Event, NavigationEnd, Router } from '@angular/router';
import { SystemRole } from 'realtime-server/lib/esm/common/models/system-role';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { SFProjectUserConfig } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config';
import { createTestProjectUserConfig } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config-test-data';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { anything, instance, mock, verify, when } from 'ts-mockito';
import { ActivatedProjectUserConfigService } from 'xforge-common/activated-project-user-config.service';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { AuthService } from 'xforge-common/auth.service';
import { createTestFeatureFlag, FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { I18nService } from 'xforge-common/i18n.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { provideTestOnlineStatus } from 'xforge-common/test-online-status-providers';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { configureTestingModule, getTestTranslocoModule } from 'xforge-common/test-utils';
import { UserService } from 'xforge-common/user.service';
import { ResumeCheckingService } from '../checking/checking/resume-checking.service';
import { ResumeTranslateService } from '../checking/checking/resume-translate.service';
import { SFProjectProfileDoc } from '../core/models/sf-project-profile-doc';
import { SFProjectUserConfigDoc } from '../core/models/sf-project-user-config-doc';
import { SFProjectService } from '../core/sf-project.service';
import { NmtDraftAuthGuard, SettingsAuthGuard, SyncAuthGuard, UsersAuthGuard } from '../shared/project-router.guard';
import { NavigationComponent } from './navigation.component';

describe('NavigationComponent', () => {
  const mockedSettingsAuthGuard = mock(SettingsAuthGuard);
  const mockedSyncAuthGuard = mock(SyncAuthGuard);
  const mockedUsersAuthGuard = mock(UsersAuthGuard);
  const mockedNmtDraftAuthGuard = mock(NmtDraftAuthGuard);
  const mockedActivatedProjectService = mock(ActivatedProjectService);
  const mockedActivatedProjectUserConfigService = mock(ActivatedProjectUserConfigService);
  const mockedAuthService = mock(AuthService);
  const mockedProjectService = mock(SFProjectService);
  const mockedUserService = mock(UserService);
  const mockedResumeCheckingService = mock(ResumeCheckingService);
  const mockedResumeTranslateService = mock(ResumeTranslateService);
  const mockedRouter = mock(Router);
  const mockedActivatedRoute = mock(ActivatedRoute);
  const mockedI18nService = mock(I18nService);
  const mockedFeatureFlagService = mock(FeatureFlagService);

  configureTestingModule(() => ({
    imports: [NavigationComponent, getTestTranslocoModule()],
    providers: [
      provideTestOnlineStatus(),
      { provide: SettingsAuthGuard, useMock: mockedSettingsAuthGuard },
      { provide: SyncAuthGuard, useMock: mockedSyncAuthGuard },
      { provide: UsersAuthGuard, useMock: mockedUsersAuthGuard },
      { provide: NmtDraftAuthGuard, useMock: mockedNmtDraftAuthGuard },
      { provide: ActivatedProjectService, useMock: mockedActivatedProjectService },
      { provide: ActivatedProjectUserConfigService, useMock: mockedActivatedProjectUserConfigService },
      { provide: AuthService, useMock: mockedAuthService },
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService },
      { provide: UserService, useMock: mockedUserService },
      { provide: ResumeCheckingService, useMock: mockedResumeCheckingService },
      { provide: ResumeTranslateService, useMock: mockedResumeTranslateService },
      { provide: Router, useMock: mockedRouter },
      { provide: ActivatedRoute, useMock: mockedActivatedRoute },
      { provide: I18nService, useMock: mockedI18nService },
      { provide: FeatureFlagService, useMock: mockedFeatureFlagService }
    ]
  }));

  class TestEnvironment {
    readonly fixture: ComponentFixture<NavigationComponent>;
    readonly component: NavigationComponent;

    readonly changes$ = new Subject<SFProjectProfileDoc | undefined>();
    readonly canSeeSettings$ = new BehaviorSubject<boolean>(false);
    readonly canSeeUsers$ = new BehaviorSubject<boolean>(false);
    readonly canSync$ = new BehaviorSubject<boolean>(false);
    readonly canGenerateDraft$ = new BehaviorSubject<boolean>(false);
    readonly projectUserConfig$ = new BehaviorSubject<SFProjectUserConfig | undefined>(undefined);
    readonly routerEvents$ = new Subject<Event>();
    readonly mockedProjectUserConfigDoc = mock(SFProjectUserConfigDoc);
    readonly projectUserConfigDoc$ = new BehaviorSubject<SFProjectUserConfigDoc | undefined>(
      instance(this.mockedProjectUserConfigDoc)
    );

    constructor() {
      when(mockedActivatedProjectService.changes$).thenReturn(this.changes$);
      when(mockedActivatedProjectService.projectDoc).thenReturn(undefined);
      when(mockedSettingsAuthGuard.allowTransition(anything())).thenReturn(this.canSeeSettings$);
      when(mockedSyncAuthGuard.allowTransition(anything())).thenReturn(this.canSync$);
      when(mockedUsersAuthGuard.allowTransition(anything())).thenReturn(this.canSeeUsers$);
      when(mockedNmtDraftAuthGuard.allowTransition(anything())).thenReturn(this.canGenerateDraft$);
      when(mockedActivatedProjectUserConfigService.projectUserConfig$).thenReturn(this.projectUserConfig$);
      when(mockedActivatedProjectUserConfigService.projectUserConfigDoc$).thenReturn(this.projectUserConfigDoc$);
      when(this.mockedProjectUserConfigDoc.submitJson0Op(anything())).thenResolve(true);
      when(mockedUserService.currentUserId).thenReturn('user01');
      when(mockedAuthService.currentUserRoles).thenReturn([]);
      when(mockedRouter.url).thenReturn('/projects/project01');
      when(mockedRouter.events).thenReturn(this.routerEvents$);
      when(mockedRouter.createUrlTree(anything(), anything())).thenReturn([] as any);
      when(mockedRouter.serializeUrl(anything())).thenReturn('');
      when(mockedResumeCheckingService.resumeLink$).thenReturn(of([]));
      when(mockedResumeTranslateService.resumeLink$).thenReturn(of(undefined));
      when(mockedFeatureFlagService.stillness).thenReturn(createTestFeatureFlag(false));

      this.fixture = TestBed.createComponent(NavigationComponent);
      this.component = this.fixture.componentInstance;
      this.fixture.detectChanges();
    }

    setDraftResultAvailable(value: boolean | undefined): void {
      when(this.mockedProjectUserConfigDoc.data).thenReturn(
        createTestProjectUserConfig({ draftResultAvailable: value })
      );
    }

    navigateTo(url: string): void {
      when(mockedRouter.url).thenReturn(url);
      this.routerEvents$.next(new NavigationEnd(1, url, url));
    }

    get adminPagesList(): DebugElement | null {
      return this.fixture.debugElement.query(By.css('#admin-pages-menu-list'));
    }

    get servalAdminNavItem(): DebugElement | null {
      return this.fixture.debugElement.query(By.css('#serval-admin-nav-item'));
    }

    get draftGenerationIcon(): DebugElement | null {
      return this.fixture.debugElement.query(By.css('#draft-generation-icon'));
    }

    get draftGenerationBadgeVisible(): boolean {
      return this.draftGenerationIcon?.nativeElement.classList.contains('mat-badge-hidden') === false;
    }

    emitProjectChange(projectDoc: SFProjectProfileDoc | undefined): void {
      when(mockedActivatedProjectService.projectDoc).thenReturn(projectDoc);
      this.changes$.next(projectDoc);
      tick(50);
      this.fixture.detectChanges();
    }
  }

  it('hides the admin section when no project is active', fakeAsync(() => {
    const env = new TestEnvironment();
    env.emitProjectChange(undefined);
    expect(env.adminPagesList).toBeNull();
    flush();
  }));

  it('shows the admin section when at least one guard allows access', fakeAsync(() => {
    const env = new TestEnvironment();
    env.canSync$.next(true);
    env.emitProjectChange({ id: 'project01' } as SFProjectProfileDoc);

    expect(env.adminPagesList).not.toBeNull();
    flush();
  }));

  it('hides the admin section when all guards deny access', fakeAsync(() => {
    const env = new TestEnvironment();
    // All guard BehaviorSubjects start false
    env.emitProjectChange({ id: 'project01' } as SFProjectProfileDoc);

    expect(env.adminPagesList).toBeNull();
    flush();
  }));

  it('re-evaluates guards when changes$ re-emits for the same project', fakeAsync(() => {
    // Regression test: previously the component sourced from projectId$, which only emits on
    // project navigation. changes$ also emits on realtime document updates (e.g. role changes),
    // so the guards must be re-queried on each emission.
    const env = new TestEnvironment();
    const projectDoc = { id: 'project01' } as SFProjectProfileDoc;
    let callCount = 0;
    when(mockedSettingsAuthGuard.allowTransition(anything())).thenCall(() => {
      callCount++;
      return env.canSeeSettings$;
    });

    env.changes$.next(projectDoc); // first emission — leading throttle fires synchronously
    expect(callCount).toBe(1);

    env.changes$.next(projectDoc); // second emission — simulates a realtime role change
    tick(50);
    expect(callCount).toBe(2);

    flush();
  }));

  it('reflects a role change that removes admin access', fakeAsync(() => {
    const env = new TestEnvironment();
    const projectDoc = { id: 'project01' } as SFProjectProfileDoc;

    env.canSync$.next(true);
    env.emitProjectChange(projectDoc);
    expect(env.adminPagesList).not.toBeNull();

    // Simulate the server revoking sync permission (e.g. role changed from Translator to Observer)
    when(mockedSyncAuthGuard.allowTransition(anything())).thenReturn(of(false));
    env.emitProjectChange(projectDoc);
    expect(env.adminPagesList).toBeNull();

    flush();
  }));

  it('shows the serval administration item for serval admins on a project', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedAuthService.currentUserRoles).thenReturn([SystemRole.ServalAdmin]);
    // The guards return true for serval admins, so the admin pages section is shown
    env.canSync$.next(true);
    env.emitProjectChange({ id: 'project01' } as SFProjectProfileDoc);

    expect(env.servalAdminNavItem).not.toBeNull();
    expect(env.component.servalAdministrationLink).toEqual(['/serval-administration', 'project01']);
    flush();
  }));

  it('hides the serval administration item for non serval admins', fakeAsync(() => {
    const env = new TestEnvironment();
    env.canSync$.next(true);
    env.emitProjectChange({ id: 'project01' } as SFProjectProfileDoc);

    expect(env.adminPagesList).not.toBeNull();
    expect(env.servalAdminNavItem).toBeNull();
    flush();
  }));

  it('shows a badge on the draft generation nav item when a draft result is available', fakeAsync(() => {
    const env = new TestEnvironment();
    env.canGenerateDraft$.next(true);
    env.emitProjectChange({
      id: 'project01',
      data: {
        userRoles: { user01: SFProjectRole.ParatextTranslator },
        checkingConfig: { checkingEnabled: false }
      }
    } as unknown as SFProjectProfileDoc);

    expect(env.draftGenerationBadgeVisible).toBe(false);

    env.projectUserConfig$.next({ draftResultAvailable: true } as SFProjectUserConfig);
    env.fixture.detectChanges();

    expect(env.draftGenerationBadgeVisible).toBe(true);
    flush();
  }));

  it('hides the draft generation badge when no draft result is available', fakeAsync(() => {
    const env = new TestEnvironment();
    env.canGenerateDraft$.next(true);
    env.emitProjectChange({
      id: 'project01',
      data: {
        userRoles: { user01: SFProjectRole.ParatextTranslator },
        checkingConfig: { checkingEnabled: false }
      }
    } as unknown as SFProjectProfileDoc);

    env.projectUserConfig$.next({ draftResultAvailable: false } as SFProjectUserConfig);
    env.fixture.detectChanges();

    expect(env.draftGenerationBadgeVisible).toBe(false);
    flush();
  }));

  it('resets the draft result available flag when the draft generation page is visited', fakeAsync(() => {
    const env = new TestEnvironment();
    env.emitProjectChange({ id: 'project01' } as SFProjectProfileDoc);
    env.setDraftResultAvailable(true);

    env.navigateTo('/projects/project01/draft-generation');
    tick();

    verify(env.mockedProjectUserConfigDoc.submitJson0Op(anything())).once();
    expect().nothing();
    flush();
  }));

  it('does not reset the draft completed flag when a different page is visited', fakeAsync(() => {
    const env = new TestEnvironment();
    env.emitProjectChange({ id: 'project01' } as SFProjectProfileDoc);
    env.setDraftResultAvailable(true);

    env.navigateTo('/projects/project01/translate');
    tick();

    verify(env.mockedProjectUserConfigDoc.submitJson0Op(anything())).never();
    expect().nothing();
    flush();
  }));

  it('does not resubmit when the draft completed flag is already false', fakeAsync(() => {
    const env = new TestEnvironment();
    env.emitProjectChange({ id: 'project01' } as SFProjectProfileDoc);
    env.setDraftResultAvailable(false);

    env.navigateTo('/projects/project01/draft-generation');
    tick();

    verify(env.mockedProjectUserConfigDoc.submitJson0Op(anything())).never();
    expect().nothing();
    flush();
  }));

  it('resets the draft completed flag when a draft result is available while already on the page', fakeAsync(() => {
    const env = new TestEnvironment();
    env.emitProjectChange({ id: 'project01' } as SFProjectProfileDoc);
    when(mockedRouter.url).thenReturn('/projects/project01/draft-generation');
    env.setDraftResultAvailable(true);

    // No navigation occurs; the flag flips to true while the user is already viewing the page
    env.projectUserConfig$.next(createTestProjectUserConfig({ draftResultAvailable: true }));
    tick();

    verify(env.mockedProjectUserConfigDoc.submitJson0Op(anything())).once();
    expect().nothing();
    flush();
  }));

  it('throttles rapid changes$ emissions to one leading and one trailing call per window', fakeAsync(() => {
    const env = new TestEnvironment();
    const projectDoc = { id: 'project01' } as SFProjectProfileDoc;
    let callCount = 0;
    when(mockedSettingsAuthGuard.allowTransition(anything())).thenCall(() => {
      callCount++;
      return env.canSeeSettings$;
    });

    // Five emissions arrive before the 50 ms window expires
    for (let i = 0; i < 5; i++) {
      env.changes$.next(projectDoc);
    }

    // The leading emission is synchronous: guard called once before any tick
    expect(callCount).toBe(1);

    tick(50);
    // The trailing emission fires at the end of the window: guard called exactly twice, not five times
    expect(callCount).toBe(2);

    flush();
  }));
});
