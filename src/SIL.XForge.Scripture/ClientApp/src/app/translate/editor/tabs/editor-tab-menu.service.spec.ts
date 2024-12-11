import { TestBed } from '@angular/core/testing';
import { invert } from 'lodash-es';
import { isParatextRole, SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { of, take } from 'rxjs';
import { mock, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { AuthService } from 'xforge-common/auth.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { SF_TYPE_REGISTRY } from '../../../core/models/sf-type-registry';
import { TabStateService } from '../../../shared/sf-tab-group';
import { EditorTabMenuService } from './editor-tab-menu.service';
import { EditorTabInfo } from './editor-tabs.types';

let service: EditorTabMenuService;
const userServiceMock = mock(UserService);
const activatedProjectMock = mock(ActivatedProjectService);
const tabStateMock: TabStateService<any, any> = mock(TabStateService);
const mockUserService = mock(UserService);
const mockAuthService = mock(AuthService);

describe('EditorTabMenuService', () => {
  configureTestingModule(() => ({
    imports: [TestRealtimeModule.forRoot(SF_TYPE_REGISTRY), TestOnlineStatusModule.forRoot(), TestTranslocoModule],
    providers: [
      EditorTabMenuService,
      { provide: UserService, useMock: userServiceMock },
      { provide: ActivatedProjectService, useMock: activatedProjectMock },
      { provide: TabStateService, useMock: tabStateMock },
      { provide: UserService, useMock: mockUserService },
      { provide: AuthService, useMock: mockAuthService },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService }
    ]
  }));

  it('should get "history", "draft", and "project-resource" menu items', done => {
    const env = new TestEnvironment();
    env.setExistingTabs([{ type: 'history', headerText: 'History', closeable: true, movable: true }]);
    service['canShowHistory'] = () => true;
    service['canShowResource'] = () => true;
    service['canShowBiblicalTerms'] = () => false;

    service.getMenuItems().subscribe(items => {
      expect(items.length).toBe(3);
      expect(items[0].type).toBe('history');
      expect(items[1].type).toBe('draft');
      expect(items[2].type).toBe('project-resource');
      done();
    });
  });

  it('should get "history", "project-resource", and not "draft" (tab already exists) menu items', done => {
    const env = new TestEnvironment();
    env.setExistingTabs([
      { type: 'history', headerText: 'History', closeable: true, movable: true },
      { type: 'draft', headerText: 'Draft', closeable: true, movable: true, unique: true },
      { type: 'project-resource', headerText: 'ABC', closeable: true, movable: true }
    ]);
    service['canShowHistory'] = () => true;
    service['canShowResource'] = () => true;
    service['canShowBiblicalTerms'] = () => false;

    service.getMenuItems().subscribe(items => {
      expect(items.length).toBe(2);
      expect(items[0].type).toBe('history');
      expect(items[1].type).toBe('project-resource');
      done();
    });
  });

  it('should get "history" (enabled), not "draft" (no draft build), and not "project-resource" menu items', done => {
    const env = new TestEnvironment(TestEnvironment.projectDocNoDraft);
    env.setExistingTabs([{ type: 'history', headerText: 'History', closeable: true, movable: true }]);
    service['canShowHistory'] = () => true;
    service['canShowResource'] = () => false;
    service['canShowBiblicalTerms'] = () => false;

    service.getMenuItems().subscribe(items => {
      expect(items.length).toBe(1);
      expect(items[0].type).toBe('history');
      done();
    });
  });

  it('should get "draft", "project-resource", and not "history" menu items', done => {
    const env = new TestEnvironment();
    env.setExistingTabs([]);
    service['canShowHistory'] = () => false;
    service['canShowResource'] = () => true;
    service['canShowBiblicalTerms'] = () => false;

    service.getMenuItems().subscribe(items => {
      expect(items.length).toBe(2);
      expect(items[0].type).toBe('draft');
      expect(items[1].type).toBe('project-resource');
      done();
    });
  });

  it('should get "project-resources" and "history", and not "draft" on resource projects', done => {
    const projectDoc = {
      id: 'resource01',
      data: createTestProjectProfile({ paratextId: 'resource16char01', userRoles: TestEnvironment.rolesByUser })
    } as SFProjectProfileDoc;
    const env = new TestEnvironment(projectDoc);
    env.setExistingTabs([]);
    service['canShowHistory'] = () => true;
    service['canShowResource'] = () => true;

    service.getMenuItems().subscribe(items => {
      expect(items.length).toBe(2);
      expect(items[0].type).toBe('history');
      expect(items[1].type).toBe('project-resource');
      done();
    });
  });

  it('should get "project-resources" and "history", and not "draft" when draft does not exist', done => {
    const projectDoc = {
      id: 'project-no-draft',
      data: createTestProjectProfile({ translateConfig: { preTranslate: false } })
    } as SFProjectProfileDoc;
    const env = new TestEnvironment(projectDoc);
    env.setExistingTabs([]);
    service['canShowHistory'] = () => true;
    service['canShowResource'] = () => true;

    service.getMenuItems().subscribe(items => {
      expect(items.length).toBe(2);
      expect(items[0].type).toBe('history');
      expect(items[1].type).toBe('project-resource');
      done();
    });
  });

  it('should get "biblical terms" menu item', done => {
    const env = new TestEnvironment();
    env.setExistingTabs([]);
    service['canShowHistory'] = () => false;
    service['canShowResource'] = () => false;

    service.getMenuItems().subscribe(items => {
      expect(items.length).toBe(2);
      expect(items[0].type).toBe('biblical-terms');
      expect(items[1].type).toBe('draft');
      done();
    });
  });

  it('should get no menu items', done => {
    const env = new TestEnvironment(TestEnvironment.projectDocNoDraft);
    env.setExistingTabs([]);
    service['canShowHistory'] = () => false;
    service['canShowResource'] = () => false;
    service['canShowBiblicalTerms'] = () => false;

    service.getMenuItems().subscribe(items => {
      expect(items.length).toBe(0);
      done();
    });
  });

  it('should handle offline', done => {
    const env = new TestEnvironment();
    env.setExistingTabs([]);
    service['canShowHistory'] = () => true;
    service['canShowResource'] = () => true;
    service['canShowBiblicalTerms'] = () => false;

    env.onlineStatus.setIsOnline(false);
    service
      .getMenuItems()
      .pipe(take(1))
      .subscribe(items => {
        expect(items.length).toBe(1);
        expect(items[0].type).toBe('history');
      });

    env.onlineStatus.setIsOnline(true);
    service
      .getMenuItems()
      .pipe(take(1))
      .subscribe(items => {
        expect(items.length).toBe(3);
        expect(items[0].type).toBe('history');
        expect(items[1].type).toBe('draft');
        expect(items[2].type).toBe('project-resource');
        done();
      });
  });

  describe('canShowHistory', () => {
    it('should return false if undefined project doc or project data', () => {
      new TestEnvironment();
      const projectDoc = { id: 'project1', data: null } as unknown as SFProjectProfileDoc;
      expect(service['canShowHistory'](projectDoc)).toBe(false);
    });

    it('should return true only if the user is a paratext user', () => {
      const env = new TestEnvironment();

      Object.values(SFProjectRole).forEach(role => {
        env.setUserByRole(role);
        expect(service['canShowHistory'](env.projectDoc)).toBe(isParatextRole(role));
      });
    });

    it('should return false if project is resource', () => {
      const env = new TestEnvironment();
      expect(service['canShowHistory'](env.projectDoc)).toBe(true);
      const resourceProjectDoc = {
        id: 'resource01',
        data: createTestProjectProfile({
          paratextId: 'resourceid16char',
          userRoles: { user01: SFProjectRole.ParatextObserver }
        })
      } as SFProjectProfileDoc;
      expect(service['canShowHistory'](resourceProjectDoc)).toBe(false);
    });
  });

  describe('canShowResource', () => {
    it('should call permissions service canSync', () => {
      const env = new TestEnvironment();
      const spy = spyOn(service['permissionsService'], 'canSync');
      service['canShowResource'](env.projectDoc);
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });
});

class TestEnvironment {
  static readonly rolesByUser = {
    user01: SFProjectRole.ParatextConsultant,
    user02: SFProjectRole.ParatextTranslator,
    user03: SFProjectRole.ParatextAdministrator,
    user04: SFProjectRole.Commenter,
    user05: SFProjectRole.ParatextObserver,
    user06: SFProjectRole.Viewer
  };
  static projectDocNoDraft: SFProjectProfileDoc = {
    id: 'project-no-draft',
    data: createTestProjectProfile({
      texts: [
        { bookNum: 40, chapters: [{ number: 1, hasDraft: false }] },
        { bookNum: 41, chapters: [{ number: 1, hasDraft: false }] }
      ]
    })
  } as SFProjectProfileDoc;

  readonly onlineStatus: TestOnlineStatusService = TestBed.inject(OnlineStatusService) as TestOnlineStatusService;
  readonly usersByRole = invert(TestEnvironment.rolesByUser);

  readonly projectDoc = {
    id: 'project1',
    data: createTestProjectProfile({
      texts: [
        { bookNum: 40, chapters: [{ number: 1, hasDraft: false }] },
        { bookNum: 41, chapters: [{ number: 1, hasDraft: true }] }
      ],
      translateConfig: {
        preTranslate: true,
        draftConfig: { lastSelectedTranslationScriptureRange: 'MAT', lastSelectedTrainingScriptureRange: 'MRK' }
      },
      userRoles: TestEnvironment.rolesByUser,
      biblicalTermsConfig: { biblicalTermsEnabled: true }
    })
  } as SFProjectProfileDoc;

  constructor(explicitProjectDoc?: SFProjectProfileDoc) {
    const projectDoc: SFProjectProfileDoc = explicitProjectDoc ?? this.projectDoc;
    when(activatedProjectMock.projectDoc$).thenReturn(of(projectDoc));
    when(mockUserService.currentUserId).thenReturn('user01');
    service = TestBed.inject(EditorTabMenuService);
  }

  setExistingTabs(tabs: EditorTabInfo[]): void {
    when(tabStateMock.tabs$).thenReturn(of(tabs as any));
  }

  setUserByRole(userRole: SFProjectRole): void {
    when(mockUserService.currentUserId).thenReturn(this.usersByRole[userRole]);
  }
}
