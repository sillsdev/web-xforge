import { CommonModule } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { Meta, StoryObj } from '@storybook/angular';
import { expect } from '@storybook/test';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { of } from 'rxjs';
import { anything, instance, mock, when } from 'ts-mockito';
import { ActivatedProjectService, TestActivatedProjectService } from 'xforge-common/activated-project.service';
import { AuthGuard } from 'xforge-common/auth.guard';
import { AuthService } from 'xforge-common/auth.service';
import { createTestFeatureFlag, FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { I18nStoryModule } from 'xforge-common/i18n-story.module';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { ResumeCheckingService } from '../checking/checking/resume-checking.service';
import { ResumeTranslateService } from '../checking/checking/resume-translate.service';
import { SFProjectProfileDoc } from '../core/models/sf-project-profile-doc';
import { SF_TYPE_REGISTRY } from '../core/models/sf-type-registry';
import { PermissionsService } from '../core/permissions.service';
import { SFProjectService } from '../core/sf-project.service';
import { NmtDraftAuthGuard, SettingsAuthGuard, SyncAuthGuard, UsersAuthGuard } from '../shared/project-router.guard';
import { NavigationComponent } from './navigation.component';

const onlineStatusService = mock(OnlineStatusService);
const mockedSFProjectService = mock(SFProjectService);
const mockedUserService = mock(UserService);
const mockedAuthService = mock(AuthService);
const mockedActivatedRoute = mock(ActivatedRoute);
const mockedFeatureFlagService = mock(FeatureFlagService);
const mockedRouter = mock(Router);
const mockedPermissionsService = mock(PermissionsService);
const mockedResumeCheckingService = mock(ResumeCheckingService);
const mockedResumeTranslateService = mock(ResumeTranslateService);
let testActivatedProjectService: ActivatedProjectService;

function setUpMocks(args: StoryState): void {
  const userId = 'user01';
  const projectId = 'project01';

  const project: SFProjectProfile = createTestProjectProfile({
    checkingConfig: { checkingEnabled: args.checkingEnabled },
    sync: {
      queuedCount: args.syncInProgress ? 1 : 0,
      lastSyncSuccessful: args.lastSyncSuccessful
    },
    userRoles: {
      [userId]: args.role
    }
  });

  when(mockedAuthService.isLoggedIn).thenResolve(true);
  when(mockedUserService.currentUserId).thenReturn(userId);
  when(onlineStatusService.isOnline).thenReturn(args.online);
  when(mockedFeatureFlagService.stillness).thenReturn(createTestFeatureFlag(false));
  when(mockedRouter.url).thenReturn(`/projects/${projectId}/${args.path}`);
  when(mockedRouter.createUrlTree(anything(), anything())).thenCall((portions: any[]) => portions.join('/'));
  when(mockedResumeCheckingService.resumeLink$).thenReturn(of(['']));
  when(mockedResumeTranslateService.resumeLink$).thenReturn(of(['']));

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [I18nStoryModule, TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)],
    providers: [{ provide: UserService, useValue: instance(mockedUserService) }]
  });

  const realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);
  realtimeService.addSnapshot<SFProjectProfile>(SFProjectProfileDoc.COLLECTION, { id: projectId, data: project });
  when(mockedSFProjectService.subscribeProfile(anything(), anything())).thenCall((id, subscription) =>
    realtimeService.subscribe(SFProjectProfileDoc.COLLECTION, id, subscription)
  );
  testActivatedProjectService = TestActivatedProjectService.withProjectId(projectId);
}

function textFromMenuElement(element: Element): string | undefined {
  const nodes = Array.from(element.querySelector('.mat-mdc-list-item-unscoped-content')?.childNodes ?? []);
  return nodes.find(node => node.nodeType === Node.TEXT_NODE)?.textContent?.trim();
}

function activeMenuItemText(element: HTMLElement): string | undefined {
  const menuItems = element.querySelectorAll('.mdc-list-item.active, .mdc-list-item.activated-nav-item');
  expect(menuItems.length).toBe(1);
  return textFromMenuElement(menuItems[0]);
}

function menuItems(element: HTMLElement): string[] {
  const menuItems = element.querySelectorAll('.mdc-list-item:not(.navigation-header)');
  return Array.from(menuItems).map(item => textFromMenuElement(item as Element)) as string[];
}

const meta: Meta = {
  title: 'App/NavigationComponent',
  component: NavigationComponent,
  argTypes: {
    role: {
      options: Object.values(SFProjectRole),
      control: { type: 'select' }
    }
  },
  render: args => {
    setUpMocks(args as StoryState);
    return {
      moduleMetadata: {
        imports: [UICommonModule, CommonModule, I18nStoryModule],
        providers: [
          { provide: AuthService, useValue: instance(mockedAuthService) },
          {
            provide: OnlineStatusService,
            useValue: instance(onlineStatusService)
          },
          {
            provide: SFProjectService,
            useValue: instance(mockedSFProjectService)
          },
          { provide: UserService, useValue: instance(mockedUserService) },
          { provide: ActivatedRoute, useValue: instance(mockedActivatedRoute) },
          { provide: SwUpdate, useValue: instance(mockedSwUpdate) },
          {
            provide: FeatureFlagService,
            useValue: instance(mockedFeatureFlagService)
          },
          { provide: Router, useValue: instance(mockedRouter) },
          {
            provide: ResumeCheckingService,
            useValue: instance(mockedResumeCheckingService)
          },
          {
            provide: ResumeTranslateService,
            useValue: instance(mockedResumeTranslateService)
          },
          {
            provide: PermissionsService,
            useValue: instance(mockedPermissionsService)
          },
          {
            provide: ActivatedProjectService,
            useValue: testActivatedProjectService
          },

          { provide: NmtDraftAuthGuard, useClass: NmtDraftAuthGuard },
          { provide: AuthGuard, useClass: AuthGuard },
          { provide: SettingsAuthGuard, useClass: SettingsAuthGuard },
          { provide: SyncAuthGuard, useClass: SyncAuthGuard },
          { provide: UsersAuthGuard, useClass: UsersAuthGuard }
        ]
      },
      template: `
        <div style="width: 255px; height: 600px;"><app-navigation></app-navigation></div>
      `
    };
  }
};

const mockedSwUpdate = mock(SwUpdate);

export default meta;

interface StoryState {
  role: SFProjectRole;
  online: boolean;
  syncInProgress: boolean;
  lastSyncSuccessful: boolean;
  checkingEnabled: boolean;
  path: string;
}

type Story = StoryObj<StoryState>;

export const Default: Story = {
  args: {
    role: SFProjectRole.ParatextAdministrator,
    online: true,
    syncInProgress: false,
    lastSyncSuccessful: true,
    checkingEnabled: true,
    path: ''
  }
};

export const Administrator: Story = {
  args: { ...Default.args, role: SFProjectRole.ParatextAdministrator },
  play: async ({ canvasElement }) => {
    expect(menuItems(canvasElement)).toEqual([
      'Overview',
      'Edit & review',
      'Generate draft',
      'Manage questions',
      'Questions & answers',
      'Sync with Paratext',
      'Users',
      'Settings'
    ]);
  }
};

export const Translator: Story = {
  args: { ...Default.args, role: SFProjectRole.ParatextTranslator },
  play: async ({ canvasElement }) => {
    expect(menuItems(canvasElement)).toEqual([
      'Overview',
      'Edit & review',
      'Generate draft',
      'My progress',
      'Questions & answers',
      'Sync with Paratext'
    ]);
  }
};

export const Consultant: Story = {
  args: { ...Default.args, role: SFProjectRole.ParatextConsultant },
  play: async ({ canvasElement }) => {
    expect(menuItems(canvasElement)).toEqual(['Overview', 'Edit & review', 'My progress', 'Questions & answers']);
  }
};

export const Observer: Story = {
  args: { ...Default.args, role: SFProjectRole.ParatextObserver },
  play: async ({ canvasElement }) => {
    expect(menuItems(canvasElement)).toEqual(['Overview', 'Edit & review', 'My progress', 'Questions & answers']);
  }
};

export const Checker: Story = {
  args: { ...Default.args, role: SFProjectRole.CommunityChecker },
  play: async ({ canvasElement }) => {
    expect(menuItems(canvasElement)).toEqual(['My progress', 'Questions & answers']);
  }
};

export const Viewer: Story = {
  args: { ...Default.args, role: SFProjectRole.Viewer },
  play: async ({ canvasElement }) => {
    expect(menuItems(canvasElement)).toEqual(['Overview', 'Edit & review']);
  }
};

export const Commenter: Story = {
  args: { ...Default.args, role: SFProjectRole.Commenter },
  play: async ({ canvasElement }) => {
    expect(menuItems(canvasElement)).toEqual(['Overview', 'Edit & review']);
  }
};

export const SyncInProgress: Story = {
  args: { ...Default.args, syncInProgress: true },
  play: async ({ canvasElement }) => {
    const syncIcon = canvasElement.querySelector('#sync-icon');
    expect(syncIcon?.classList).toContain('sync-in-progress');
  }
};

export const SyncFailed: Story = {
  args: { ...Default.args, lastSyncSuccessful: false },
  play: async ({ canvasElement }) => {
    // The mat-badge is not rendered immediately, so we need to wait for it to appear
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(canvasElement.querySelector('#sync-icon .mat-badge-active')).toBeInTheDocument();
  }
};

export const Offline: Story = {
  args: { ...Default.args, online: false },
  play: async ({ canvasElement }) => {
    expect(canvasElement.querySelector('#admin-pages-menu-list')?.classList).toContain('disabled-offline');
  }
};

export const CheckingDisabled: Story = {
  args: { ...Administrator.args, checkingEnabled: false },
  play: async ({ canvasElement }) => {
    expect(menuItems(canvasElement)).toEqual([
      'Overview',
      'Edit & review',
      'Generate draft',
      'Sync with Paratext',
      'Users',
      'Settings'
    ]);
  }
};

export const TranslateOverviewActive: Story = {
  args: { ...Administrator.args, path: 'translate' },
  play: async ({ canvasElement }) => {
    expect(activeMenuItemText(canvasElement)).toBe('Overview');
  }
};

export const TranslateEditorActive: Story = {
  args: { ...Administrator.args, path: 'translate/GEN' },
  play: async ({ canvasElement }) => {
    expect(activeMenuItemText(canvasElement)).toBe('Edit & review');
  }
};

export const GenerateDraftActive: Story = {
  args: { ...Administrator.args, path: 'draft-generation' },
  play: async ({ canvasElement }) => {
    expect(activeMenuItemText(canvasElement)).toBe('Generate draft');
  }
};

export const ManageQuestionsActive: Story = {
  args: { ...Administrator.args, path: 'checking' },
  play: async ({ canvasElement }) => {
    expect(activeMenuItemText(canvasElement)).toBe('Manage questions');
  }
};

export const CheckingProgressActive: Story = {
  args: { ...Checker.args, path: 'checking' },
  play: async ({ canvasElement }) => {
    expect(activeMenuItemText(canvasElement)).toBe('My progress');
  }
};

export const CheckingAnswerQuestionsActive: Story = {
  args: { ...Checker.args, path: 'checking/GEN' },
  play: async ({ canvasElement }) => {
    expect(activeMenuItemText(canvasElement)).toBe('Questions & answers');
  }
};

export const SyncPageActive: Story = {
  args: { ...Administrator.args, path: 'sync' },
  play: async ({ canvasElement }) => {
    expect(activeMenuItemText(canvasElement)).toBe('Sync with Paratext');
  }
};

export const UsersPageActive: Story = {
  args: { ...Administrator.args, path: 'users' },
  play: async ({ canvasElement }) => {
    expect(activeMenuItemText(canvasElement)).toBe('Users');
  }
};

export const SettingsPageActive: Story = {
  args: { ...Administrator.args, path: 'settings' },
  play: async ({ canvasElement }) => {
    expect(activeMenuItemText(canvasElement)).toBe('Settings');
  }
};

export const RTL: Story = {
  args: Default.args,
  parameters: { locale: 'ar' }
};
