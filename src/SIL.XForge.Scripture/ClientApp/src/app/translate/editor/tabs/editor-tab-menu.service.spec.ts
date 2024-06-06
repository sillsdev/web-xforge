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
import { BuildDto } from '../../../machine-api/build-dto';
import { TabStateService } from '../../../shared/sf-tab-group';
import { DraftGenerationService } from '../../draft-generation/draft-generation.service';
import { EditorTabMenuService } from './editor-tab-menu.service';
import { EditorTabInfo } from './editor-tabs.types';

let service: EditorTabMenuService;
const userServiceMock = mock(UserService);
const activatedProjectMock = mock(ActivatedProjectService);
const draftGenerationServiceMock = mock(DraftGenerationService);
const tabStateMock = mock(TabStateService);
const mockUserService = mock(UserService);
const mockAuthService = mock(AuthService);

describe('EditorTabMenuService', () => {
  configureTestingModule(() => ({
    imports: [TestRealtimeModule.forRoot(SF_TYPE_REGISTRY), TestOnlineStatusModule.forRoot(), TestTranslocoModule],
    providers: [
      EditorTabMenuService,
      { provide: UserService, useMock: userServiceMock },
      { provide: ActivatedProjectService, useMock: activatedProjectMock },
      { provide: DraftGenerationService, useMock: draftGenerationServiceMock },
      { provide: TabStateService, useMock: tabStateMock },
      { provide: UserService, useMock: mockUserService },
      { provide: AuthService, useMock: mockAuthService },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService }
    ]
  }));

  it('should get "history", "draft", and "project-resource" menu items', done => {
    const env = new TestEnvironment();
    env.setExistingTabs([{ type: 'history', headerText: 'History', closeable: true, movable: true }]);
    env.setLastCompletedBuildExists(true);
    service['canShowHistory'] = () => true;
    service['canShowResource'] = () => true;

    service.getMenuItems().subscribe(items => {
      expect(items.length).toBe(3);
      expect(items[0].type).toBe('history');
      expect(items[0].disabled).toBeFalsy();
      expect(items[1].type).toBe('draft');
      expect(items[1].disabled).toBeFalsy();
      expect(items[2].type).toBe('project-resource');
      expect(items[2].disabled).toBeFalsy();
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
    env.setLastCompletedBuildExists(true);
    service['canShowHistory'] = () => true;
    service['canShowResource'] = () => true;

    service.getMenuItems().subscribe(items => {
      expect(items.length).toBe(2);
      expect(items[0].type).toBe('history');
      expect(items[0].disabled).toBeFalsy();
      expect(items[1].type).toBe('project-resource');
      expect(items[1].disabled).toBeFalsy();
      done();
    });
  });

  it('should get "history" (enabled), not "draft" (no draft build), and not "project-resource" menu items', done => {
    const env = new TestEnvironment();
    env.setExistingTabs([{ type: 'history', headerText: 'History', closeable: true, movable: true }]);
    env.setLastCompletedBuildExists(false);
    service['canShowHistory'] = () => true;
    service['canShowResource'] = () => false;

    service.getMenuItems().subscribe(items => {
      expect(items.length).toBe(1);
      expect(items[0].type).toBe('history');
      expect(items[0].disabled).toBeFalsy();
      done();
    });
  });

  it('should get "draft", "project-resource", and not "history" menu items', done => {
    const env = new TestEnvironment();
    env.setExistingTabs([]);
    env.setLastCompletedBuildExists(true);
    service['canShowHistory'] = () => false;
    service['canShowResource'] = () => true;

    service.getMenuItems().subscribe(items => {
      expect(items.length).toBe(2);
      expect(items[0].type).toBe('draft');
      expect(items[0].disabled).toBeFalsy();
      expect(items[1].type).toBe('project-resource');
      expect(items[1].disabled).toBeFalsy();
      done();
    });
  });

  it('should get no menu items', done => {
    const env = new TestEnvironment();
    env.setExistingTabs([]);
    env.setLastCompletedBuildExists(false);
    service['canShowHistory'] = () => false;
    service['canShowResource'] = () => false;

    service.getMenuItems().subscribe(items => {
      expect(items.length).toBe(0);
      done();
    });
  });

  it('should handle offline', done => {
    const env = new TestEnvironment();
    env.setExistingTabs([]);
    env.setLastCompletedBuildExists(true);
    service['canShowHistory'] = () => true;
    service['canShowResource'] = () => true;

    env.onlineStatus.setIsOnline(false);
    service
      .getMenuItems()
      .pipe(take(1))
      .subscribe(items => {
        expect(items.length).toBe(1);
        expect(items[0].type).toBe('history');
        expect(items[0].disabled).toBeFalsy();
      });

    env.onlineStatus.setIsOnline(true);
    service
      .getMenuItems()
      .pipe(take(1))
      .subscribe(items => {
        expect(items.length).toBe(3);
        expect(items[0].type).toBe('history');
        expect(items[0].disabled).toBeFalsy();
        expect(items[1].type).toBe('draft');
        expect(items[1].disabled).toBeFalsy();
        expect(items[2].type).toBe('project-resource');
        expect(items[2].disabled).toBeFalsy();
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
  readonly onlineStatus: TestOnlineStatusService = TestBed.inject(OnlineStatusService) as TestOnlineStatusService;

  readonly rolesByUser = {
    user01: SFProjectRole.ParatextConsultant,
    user02: SFProjectRole.ParatextTranslator,
    user03: SFProjectRole.ParatextAdministrator,
    user04: SFProjectRole.Commenter,
    user05: SFProjectRole.ParatextObserver,
    user06: SFProjectRole.Viewer
  };

  readonly usersByRole = invert(this.rolesByUser);

  readonly projectDoc = {
    id: 'project1',
    data: createTestProjectProfile({
      translateConfig: {
        preTranslate: true
      },
      userRoles: this.rolesByUser
    })
  } as SFProjectProfileDoc;

  constructor() {
    when(activatedProjectMock.projectDoc$).thenReturn(of(this.projectDoc));
    when(mockUserService.currentUserId).thenReturn('user01');
    service = TestBed.inject(EditorTabMenuService);
  }

  setExistingTabs(tabs: EditorTabInfo[]): void {
    when(tabStateMock.tabs$).thenReturn(of(tabs as any));
  }

  setLastCompletedBuildExists(exists: boolean): void {
    when(draftGenerationServiceMock.getLastCompletedBuild(this.projectDoc.id)).thenReturn(
      of(exists ? ({} as BuildDto) : undefined)
    );
  }
  setUserByRole(userRole: SFProjectRole): void {
    when(mockUserService.currentUserId).thenReturn(this.usersByRole[userRole]);
  }
}
