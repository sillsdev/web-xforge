import { TestBed } from '@angular/core/testing';
import { invert } from 'lodash-es';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { of, take } from 'rxjs';
import { SF_TYPE_REGISTRY } from 'src/app/core/models/sf-type-registry';
import { TabStateService } from 'src/app/shared/sf-tab-group';
import { anything, mock, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { I18nService } from 'xforge-common/i18n.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { configureTestingModule } from 'xforge-common/test-utils';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { BuildDto } from '../../../machine-api/build-dto';
import { DraftGenerationService } from '../../draft-generation/draft-generation.service';
import { EditorTabMenuService } from './editor-tab-menu.service';
import { EditorTabInfo } from './editor-tabs.types';

let service: EditorTabMenuService;
const userServiceMock = mock(UserService);
const activatedProjectMock = mock(ActivatedProjectService);
const draftGenerationServiceMock = mock(DraftGenerationService);
const tabStateMock = mock(TabStateService);
const mockUserService = mock(UserService);
const mockI18nService = mock(I18nService);

describe('EditorTabsMenuService', () => {
  configureTestingModule(() => ({
    imports: [TestRealtimeModule.forRoot(SF_TYPE_REGISTRY), TestOnlineStatusModule.forRoot()],
    providers: [
      EditorTabMenuService,
      { provide: UserService, useMock: userServiceMock },
      { provide: ActivatedProjectService, useMock: activatedProjectMock },
      { provide: DraftGenerationService, useMock: draftGenerationServiceMock },
      { provide: TabStateService, useMock: tabStateMock },
      { provide: UserService, useMock: mockUserService },
      { provide: I18nService, useMock: mockI18nService },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService }
    ]
  }));

  it('should get "history" and "draft" menu items', done => {
    const env = new TestEnvironment();
    env.setExistingTabs([{ type: 'history', headerText: 'History', closeable: true, movable: true }]);
    env.setLastCompletedBuildExists(true);
    service['canShowHistory'] = () => true;

    service.getMenuItems().subscribe(items => {
      expect(items.length).toBe(2);
      expect(items[0].type).toBe('history');
      expect(items[0].disabled).toBeFalsy();
      expect(items[1].type).toBe('draft');
      expect(items[1].disabled).toBeFalsy();
      done();
    });
  });

  it('should get "history" and not "draft" (tab already exists) menu items', done => {
    const env = new TestEnvironment();
    env.setExistingTabs([
      { type: 'history', headerText: 'History', closeable: true, movable: true },
      { type: 'draft', headerText: 'Draft', closeable: true, movable: true, unique: true }
    ]);
    env.setLastCompletedBuildExists(true);
    service['canShowHistory'] = () => true;

    service.getMenuItems().subscribe(items => {
      expect(items.length).toBe(1);
      expect(items[0].type).toBe('history');
      expect(items[0].disabled).toBeFalsy();
      done();
    });
  });

  it('should get "history" (enabled) and not "draft" (no draft build) menu items', done => {
    const env = new TestEnvironment();
    env.setExistingTabs([{ type: 'history', headerText: 'History', closeable: true, movable: true }]);
    env.setLastCompletedBuildExists(false);
    service['canShowHistory'] = () => true;

    service.getMenuItems().subscribe(items => {
      expect(items.length).toBe(1);
      expect(items[0].type).toBe('history');
      expect(items[0].disabled).toBeFalsy();
      done();
    });
  });

  it('should get "draft" and not "history" menu items', done => {
    const env = new TestEnvironment();
    env.setExistingTabs([]);
    env.setLastCompletedBuildExists(true);
    service['canShowHistory'] = () => false;

    service.getMenuItems().subscribe(items => {
      expect(items.length).toBe(1);
      expect(items[0].type).toBe('draft');
      expect(items[0].disabled).toBeFalsy();
      done();
    });
  });

  it('should get no menu items', done => {
    const env = new TestEnvironment();
    env.setExistingTabs([]);
    env.setLastCompletedBuildExists(false);
    service['canShowHistory'] = () => false;

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
        expect(items.length).toBe(2);
        expect(items[0].type).toBe('history');
        expect(items[0].disabled).toBeFalsy();
        expect(items[1].type).toBe('draft');
        expect(items[1].disabled).toBeFalsy();
        done();
      });
  });

  describe('canShowHistory', () => {
    it('should return false if undefined project doc or project data', () => {
      new TestEnvironment();
      const projectDoc = { id: 'project1', data: null } as unknown as SFProjectProfileDoc;
      expect(service['canShowHistory'](undefined)).toBe(false);
      expect(service['canShowHistory'](projectDoc)).toBe(false);
    });

    it('should return true only if the user is an administrator or translator', () => {
      const env = new TestEnvironment();

      env.setUserByRole(SFProjectRole.ParatextConsultant);
      expect(service['canShowHistory'](env.projectDoc)).toBe(true);

      env.setUserByRole(SFProjectRole.ParatextTranslator);
      expect(service['canShowHistory'](env.projectDoc)).toBe(true);

      env.setUserByRole(SFProjectRole.ParatextAdministrator);
      expect(service['canShowHistory'](env.projectDoc)).toBe(true);

      env.setUserByRole(SFProjectRole.Commenter);
      expect(service['canShowHistory'](env.projectDoc)).toBe(false);

      env.setUserByRole(SFProjectRole.ParatextObserver);
      expect(service['canShowHistory'](env.projectDoc)).toBe(true);

      env.setUserByRole(SFProjectRole.Viewer);
      expect(service['canShowHistory'](env.projectDoc)).toBe(false);
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
    when(mockI18nService.translate(anything())).thenReturn(of(''));
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
