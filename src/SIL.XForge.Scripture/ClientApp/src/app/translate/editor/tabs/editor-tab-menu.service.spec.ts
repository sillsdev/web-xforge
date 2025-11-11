import { TestBed } from '@angular/core/testing';
import { invert } from 'lodash-es';
import { isParatextRole, SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { firstValueFrom, of } from 'rxjs';
import { anything, mock, when } from 'ts-mockito';
import { v4 as uuid } from 'uuid';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { provideTestOnlineStatus } from 'xforge-common/test-online-status-providers';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { provideTestRealtime } from 'xforge-common/test-realtime-providers';
import { configureTestingModule, getTestTranslocoModule } from 'xforge-common/test-utils';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { SF_TYPE_REGISTRY } from '../../../core/models/sf-type-registry';
import { PermissionsService } from '../../../core/permissions.service';
import { SFProjectService } from '../../../core/sf-project.service';
import { TabStateService } from '../../../shared/sf-tab-group';
import { DraftGenerationService } from '../../draft-generation/draft-generation.service';
import { DraftOptionsService } from '../../draft-generation/draft-options.service';
import { EditorTabMenuService } from './editor-tab-menu.service';
import { EditorTabInfo } from './editor-tabs.types';

let service: EditorTabMenuService;
const mockActivatedProject = mock(ActivatedProjectService);
const mockTabState: TabStateService<any, any> = mock(TabStateService);
const mockUserService = mock(UserService);
const mockPermissionsService = mock(PermissionsService);
const mockSFProjectService = mock(SFProjectService);
const mockDraftOptionsService = mock(DraftOptionsService);
const mockDraftGenerationService = mock(DraftGenerationService);

describe('EditorTabMenuService', () => {
  configureTestingModule(() => ({
    imports: [getTestTranslocoModule()],
    providers: [
      provideTestRealtime(SF_TYPE_REGISTRY),
      provideTestOnlineStatus(),
      EditorTabMenuService,
      { provide: ActivatedProjectService, useMock: mockActivatedProject },
      { provide: TabStateService, useMock: mockTabState },
      { provide: UserService, useMock: mockUserService },
      { provide: PermissionsService, useMock: mockPermissionsService },
      { provide: SFProjectService, useMock: mockSFProjectService },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService },
      { provide: DraftOptionsService, useMock: mockDraftOptionsService },
      { provide: DraftGenerationService, useMock: mockDraftGenerationService }
    ]
  }));

  it('should get "history", "draft", and "project-resource" menu items', async () => {
    const env = new TestEnvironment(undefined, { hasCompletedDraftBuild: true });
    env.setExistingTabs([{ id: uuid(), type: 'history', headerText$: of('History'), closeable: true, movable: true }]);
    service['canShowHistory'] = () => true;
    service['canShowResource'] = () => true;
    service['canShowBiblicalTerms'] = () => false;

    const items = await firstValueFrom(service.getMenuItems());
    expect(items.map(i => i.type)).toEqual(['history', 'draft', 'project-resource']);
  });

  it('should get "history", "project-resource", and not "draft" (tab already exists) menu items', async () => {
    const env = new TestEnvironment();
    env.setExistingTabs([
      { id: uuid(), type: 'history', headerText$: of('History'), closeable: true, movable: true },
      { id: uuid(), type: 'draft', headerText$: of('Draft'), closeable: true, movable: true, unique: true },
      { id: uuid(), type: 'project-resource', headerText$: of('ABC'), closeable: true, movable: true }
    ]);
    service['canShowHistory'] = () => true;
    service['canShowResource'] = () => true;
    service['canShowBiblicalTerms'] = () => false;

    const items = await firstValueFrom(service.getMenuItems());
    expect(items.map(i => i.type)).toEqual(['history', 'project-resource']);
  });

  it('should get "history" (enabled), not "draft" (no draft build), and not "project-resource" menu items', async () => {
    const env = new TestEnvironment(TestEnvironment.projectDocNoDraft, { hasCompletedDraftBuild: false });
    env.setExistingTabs([{ id: uuid(), type: 'history', headerText$: of('History'), closeable: true, movable: true }]);
    service['canShowHistory'] = () => true;
    service['canShowResource'] = () => false;
    service['canShowBiblicalTerms'] = () => false;

    const items = await firstValueFrom(service.getMenuItems());
    expect(items.map(i => i.type)).toEqual(['history']);
  });

  it('should get "draft", "project-resource", and not "history" menu items', async () => {
    const env = new TestEnvironment(undefined, { hasCompletedDraftBuild: true });
    env.setExistingTabs([]);
    service['canShowHistory'] = () => false;
    service['canShowResource'] = () => true;
    service['canShowBiblicalTerms'] = () => false;

    const items = await firstValueFrom(service.getMenuItems());
    expect(items.map(i => i.type)).toEqual(['draft', 'project-resource']);
  });

  it('should get "project-resources" and "history", and not "draft" on resource projects', async () => {
    const projectDoc = {
      id: 'resource01',
      data: createTestProjectProfile({ paratextId: 'resource16char01', userRoles: TestEnvironment.rolesByUser })
    } as SFProjectProfileDoc;
    const env = new TestEnvironment(projectDoc);
    env.setExistingTabs([]);
    service['canShowHistory'] = () => true;
    service['canShowResource'] = () => true;

    const items = await firstValueFrom(service.getMenuItems());
    expect(items.map(i => i.type)).toEqual(['history', 'project-resource']);
  });

  it('should get "project-resources" and "history", and not "draft" when draft does not exist', async () => {
    const projectDoc = {
      id: 'project-no-draft',
      data: createTestProjectProfile({ translateConfig: { preTranslate: false } })
    } as SFProjectProfileDoc;
    const env = new TestEnvironment(projectDoc);
    env.setExistingTabs([]);
    service['canShowHistory'] = () => true;
    service['canShowResource'] = () => true;

    const items = await firstValueFrom(service.getMenuItems());
    expect(items.map(i => i.type)).toEqual(['history', 'project-resource']);
  });

  it('should not get "draft" if the user cannot view drafts', async () => {
    const env = new TestEnvironment();
    when(mockPermissionsService.canAccessDrafts(anything(), anything())).thenReturn(false);
    env.setExistingTabs([]);
    service['canShowHistory'] = () => true;

    const items = await firstValueFrom(service.getMenuItems());
    expect(items.map(i => i.type)).toEqual(['history']);
  });

  it('should get "biblical terms" menu item', async () => {
    const env = new TestEnvironment();
    when(mockPermissionsService.canAccessBiblicalTerms(anything())).thenReturn(true);
    env.setExistingTabs([]);
    service['canShowHistory'] = () => false;
    service['canShowResource'] = () => false;

    const items = await firstValueFrom(service.getMenuItems());

    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items.some(i => i.type === 'biblical-terms')).toBe(true);
    if (items.length > 1) {
      expect(items.some(i => i.type === 'draft')).toBe(true);
    }
  });

  it('should get no menu items', async () => {
    const env = new TestEnvironment(TestEnvironment.projectDocNoDraft, { hasCompletedDraftBuild: false });
    env.setExistingTabs([]);
    service['canShowHistory'] = () => false;
    service['canShowResource'] = () => false;
    service['canShowBiblicalTerms'] = () => false;

    const items = await firstValueFrom(service.getMenuItems());
    expect(items.length).toBe(0);
  });

  it('should handle offline', async () => {
    const env = new TestEnvironment(undefined, { hasCompletedDraftBuild: true });
    env.setExistingTabs([]);
    service['canShowHistory'] = () => true;
    service['canShowResource'] = () => true;
    service['canShowBiblicalTerms'] = () => false;

    // Wait for observables to settle
    env.onlineStatus.setIsOnline(false);
    const offlineItems = await firstValueFrom(service.getMenuItems());
    expect(offlineItems.map(i => i.type)).toEqual(['history']);

    env.onlineStatus.setIsOnline(true);
    const onlineItems = await firstValueFrom(service.getMenuItems());
    expect(onlineItems.map(i => i.type)).toEqual(['history', 'draft', 'project-resource']);
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

  it('should not show draft menu item when draft formatting (usfmConfig) is not set', async () => {
    // Simulate formatting options available but still unselected, so draft tab should be hidden
    const env = new TestEnvironment(undefined, { formattingOptionsAvailableButUnselected: true });
    env.setExistingTabs([]);
    service['canShowHistory'] = () => true;
    service['canShowResource'] = () => true;
    service['canShowBiblicalTerms'] = () => false;

    const items = await firstValueFrom(service.getMenuItems());
    expect(items.map(i => i.type)).toEqual(['history', 'project-resource']);
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
        { bookNum: 40, chapters: [{ number: 1 }] },
        { bookNum: 41, chapters: [{ number: 1 }] }
      ]
    })
  } as SFProjectProfileDoc;

  readonly onlineStatus: TestOnlineStatusService = TestBed.inject(OnlineStatusService) as TestOnlineStatusService;
  readonly usersByRole = invert(TestEnvironment.rolesByUser);

  readonly projectDoc = {
    id: 'project1',
    data: createTestProjectProfile({
      texts: [
        { bookNum: 40, chapters: [{ number: 1 }] },
        { bookNum: 41, chapters: [{ number: 1 }] }
      ],
      translateConfig: {
        preTranslate: true
      },
      userRoles: TestEnvironment.rolesByUser,
      biblicalTermsConfig: { biblicalTermsEnabled: true }
    })
  } as SFProjectProfileDoc;

  constructor(
    explicitProjectDoc?: SFProjectProfileDoc,
    options?: { hasCompletedDraftBuild?: boolean; formattingOptionsAvailableButUnselected?: boolean }
  ) {
    const projectDoc: SFProjectProfileDoc = explicitProjectDoc ?? this.projectDoc;
    const hasCompletedDraftBuild = options?.hasCompletedDraftBuild ?? true;
    when(mockActivatedProject.changes$).thenReturn(of(projectDoc));
    when(mockActivatedProject.projectId$).thenReturn(of(projectDoc.id));
    when(mockActivatedProject.projectId).thenReturn(projectDoc.id);
    when(mockTabState.tabs$).thenReturn(of([] as EditorTabInfo[]));
    when(mockDraftGenerationService.getLastCompletedBuild(anything())).thenReturn(
      of(hasCompletedDraftBuild ? ({} as any) : undefined)
    );
    when(mockDraftOptionsService.areFormattingOptionsAvailableButUnselected(anything())).thenReturn(
      options?.formattingOptionsAvailableButUnselected ?? false
    );
    when(mockUserService.currentUserId).thenReturn('user01');
    when(mockPermissionsService.canAccessDrafts(anything(), anything())).thenReturn(true);
    when(mockSFProjectService.hasDraft(anything())).thenReturn(options?.hasCompletedDraftBuild ?? false);
    service = TestBed.inject(EditorTabMenuService);
  }

  setExistingTabs(tabs: EditorTabInfo[]): void {
    when(mockTabState.tabs$).thenReturn(of(tabs as any));
  }

  setUserByRole(userRole: SFProjectRole): void {
    when(mockUserService.currentUserId).thenReturn(this.usersByRole[userRole]);
  }
}
