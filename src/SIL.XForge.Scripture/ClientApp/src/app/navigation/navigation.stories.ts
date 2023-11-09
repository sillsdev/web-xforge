import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { Meta, StoryFn } from '@storybook/angular';
import { CheckingAnswerExport } from 'realtime-server/lib/esm/scriptureforge/models/checking-config';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { anything, instance, mock, when } from 'ts-mockito';
import { AuthGuard } from 'xforge-common/auth.guard';
import { AuthService } from 'xforge-common/auth.service';
import { I18nStoryModule } from 'xforge-common/i18n-story.module';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { expect } from '@storybook/jest';
import { FeatureFlagService, ObservableFeatureFlag } from 'xforge-common/feature-flags/feature-flag.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { ActivatedProjectService, TestActivatedProjectService } from 'xforge-common/activated-project.service';
import { TestBed } from '@angular/core/testing';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { SFProjectProfileDoc } from '../core/models/sf-project-profile-doc';
import { SFProjectService } from '../core/sf-project.service';
import { SettingsAuthGuard, SyncAuthGuard, UsersAuthGuard } from '../shared/project-router.guard';
import { ResumeCheckingService } from '../checking/checking/resume-checking.service';
import { SF_TYPE_REGISTRY } from '../core/models/sf-type-registry';
import { NavigationComponent } from './navigation.component';

const onlineStatusService = mock(OnlineStatusService);
const mockedSFProjectService = mock(SFProjectService);
const mockedUserService = mock(UserService);
const mockedAuthService = mock(AuthService);
const mockedActivatedRoute = mock(ActivatedRoute);
const mockedFeatureFlagService = mock(FeatureFlagService);
const mockedRouter = mock(Router);
const mockedResumeCheckingService = mock(ResumeCheckingService);
let testActivatedProjectService: ActivatedProjectService;

function setUpMocks(_args: any, context: any): void {
  const userId = 'user01';
  const projectId = 'project01';

  const project: SFProjectProfile = {
    name: 'Test Project',
    paratextId: 'pt01',
    shortName: 'TP',
    writingSystem: {
      tag: 'en'
    },
    translateConfig: {
      translationSuggestionsEnabled: true,
      shareEnabled: false,
      preTranslate: false,
      draftConfig: {}
    },
    checkingConfig: {
      checkingEnabled: !!context.args.checkingEnabled,
      shareEnabled: true,
      usersSeeEachOthersResponses: true,
      answerExportMethod: CheckingAnswerExport.MarkedForExport
    },
    texts: [],
    sync: {
      queuedCount: context.args.syncInProgress ? 1 : 0,
      lastSyncSuccessful: !!context?.args?.lastSyncSuccessful
    },
    biblicalTermsConfig: {
      biblicalTermsEnabled: false,
      hasRenderings: false
    },
    editable: true,
    userRoles: {
      [userId]: context.args.role
    },
    userPermissions: {}
  };

  when(mockedAuthService.isLoggedIn).thenResolve(true);
  when(mockedUserService.currentUserId).thenReturn(userId);
  when(onlineStatusService.isOnline).thenReturn(context.args.online);
  when(mockedFeatureFlagService.showNmtDrafting).thenReturn({ enabled: true } as ObservableFeatureFlag);
  when(mockedFeatureFlagService.stillness).thenReturn({ enabled: false } as ObservableFeatureFlag);
  when(mockedRouter.url).thenReturn(`/projects/${projectId}/${context.args.path}`);
  when(mockedRouter.createUrlTree(anything(), anything())).thenCall((portions: any[]) => portions.join('/'));
  when(mockedResumeCheckingService.getLink()).thenReturn(['']);

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [I18nStoryModule, TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)] });

  const realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);
  realtimeService.addSnapshot<SFProjectProfile>(SFProjectProfileDoc.COLLECTION, { id: projectId, data: project });
  when(mockedSFProjectService.getProfile(anything())).thenCall(id =>
    realtimeService.subscribe(SFProjectProfileDoc.COLLECTION, id)
  );
  testActivatedProjectService = TestActivatedProjectService.withProjectId(projectId);
}

function textFromMenuElement(element: Element): string | undefined {
  const nodes = Array.from(element.querySelector('.mat-list-item-content')?.childNodes ?? []);
  return nodes.find(node => node.nodeType === Node.TEXT_NODE)?.textContent?.trim();
}

function activeMenuItemText(element: HTMLElement): string | undefined {
  const menuItems = element.querySelectorAll('.mat-list-item.active, .mat-list-item.activated-nav-item');
  expect(menuItems.length).toBe(1);
  return textFromMenuElement(menuItems[0]!);
}

function menuItems(element: HTMLElement): string[] {
  const menuItems = element.querySelectorAll('.mat-list-item:not(.navigation-header)');
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
  }
};

const mockedSwUpdate = mock(SwUpdate);

export default meta;

type Story = StoryFn;

const Template: StoryFn = (args, context) => {
  setUpMocks(args, context);
  return {
    moduleMetadata: {
      imports: [UICommonModule, CommonModule, I18nStoryModule],
      providers: [
        { provide: AuthService, useValue: instance(mockedAuthService) },
        { provide: OnlineStatusService, useValue: instance(onlineStatusService) },
        { provide: SFProjectService, useValue: instance(mockedSFProjectService) },
        { provide: UserService, useValue: instance(mockedUserService) },
        { provide: ActivatedRoute, useValue: instance(mockedActivatedRoute) },
        { provide: SwUpdate, useValue: instance(mockedSwUpdate) },
        { provide: FeatureFlagService, useValue: instance(mockedFeatureFlagService) },
        { provide: Router, useValue: instance(mockedRouter) },
        { provide: ResumeCheckingService, useValue: instance(mockedResumeCheckingService) },
        { provide: ActivatedProjectService, useValue: testActivatedProjectService },

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
};

export const Default: Story = Template.bind({});
Default.args = {
  role: SFProjectRole.ParatextAdministrator,
  online: true,
  syncInProgress: false,
  lastSyncSuccessful: true,
  checkingEnabled: true,
  path: ''
};

export const Administrator: Story = Template.bind({});
Administrator.args = { ...Default.args, role: SFProjectRole.ParatextAdministrator };
Administrator.play = async ({ canvasElement }) => {
  expect(menuItems(canvasElement)).toEqual([
    'Overview',
    'Draft & review',
    'Generate draft',
    'Manage questions',
    'Questions & answers',
    'Synchronize',
    'Users',
    'Settings'
  ]);
};

export const Translator: Story = Template.bind({});
Translator.args = { ...Default.args, role: SFProjectRole.ParatextTranslator };
Translator.play = async ({ canvasElement }) => {
  expect(menuItems(canvasElement)).toEqual([
    'Overview',
    'Draft & review',
    'Generate draft',
    'My progress',
    'Questions & answers',
    'Synchronize'
  ]);
};

export const Consultant: Story = Template.bind({});
Consultant.args = { ...Default.args, role: SFProjectRole.ParatextConsultant };
Consultant.play = async ({ canvasElement }) => {
  expect(menuItems(canvasElement)).toEqual(['Overview', 'Draft & review', 'My progress', 'Questions & answers']);
};

export const Observer: Story = Template.bind({});
Observer.args = { ...Default.args, role: SFProjectRole.ParatextObserver };
Observer.play = async ({ canvasElement }) => {
  expect(menuItems(canvasElement)).toEqual(['Overview', 'Draft & review', 'My progress', 'Questions & answers']);
};

export const Checker: Story = Template.bind({});
Checker.args = { ...Default.args, role: SFProjectRole.CommunityChecker };
Checker.play = async ({ canvasElement }) => {
  expect(menuItems(canvasElement)).toEqual(['My progress', 'Questions & answers']);
};

export const Viewer: Story = Template.bind({});
Viewer.args = { ...Default.args, role: SFProjectRole.Viewer };
Viewer.play = async ({ canvasElement }) => {
  expect(menuItems(canvasElement)).toEqual(['Overview', 'Draft & review']);
};

export const Commenter: Story = Template.bind({});
Commenter.args = { ...Default.args, role: SFProjectRole.Commenter };
Commenter.play = async ({ canvasElement }) => {
  expect(menuItems(canvasElement)).toEqual(['Overview', 'Draft & review']);
};

export const SyncInProgress: Story = Template.bind({});
SyncInProgress.args = { ...Default.args, syncInProgress: true };
SyncInProgress.play = async ({ canvasElement }) => {
  const syncIcon = canvasElement.querySelector('#sync-icon');
  expect(syncIcon?.classList).toContain('sync-in-progress');
};

export const SyncFailed: Story = Template.bind({});
SyncFailed.args = { ...Default.args, lastSyncSuccessful: false };
SyncFailed.play = async ({ canvasElement }) => {
  // The mat-badge is not rendered immediately, so we need to wait for it to appear.
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(canvasElement.querySelector('#sync-icon .mat-badge-active')).toBeInTheDocument();
};

export const Offline: Story = Template.bind({});
Offline.args = { ...Default.args, online: false };
Offline.play = async ({ canvasElement }) => {
  expect(canvasElement.querySelector('#admin-pages-menu-list')?.classList).toContain('disabled-offline');
};

export const CheckingDisabled: Story = Template.bind({});
CheckingDisabled.args = { ...Administrator.args, checkingEnabled: false };
CheckingDisabled.play = async ({ canvasElement }) => {
  expect(menuItems(canvasElement)).toEqual([
    'Overview',
    'Draft & review',
    'Generate draft',
    'Synchronize',
    'Users',
    'Settings'
  ]);
};

export const TranslateOverviewActive = Template.bind({});
TranslateOverviewActive.args = { ...Administrator.args, path: 'translate' };
TranslateOverviewActive.play = async ({ canvasElement }) => {
  expect(activeMenuItemText(canvasElement)).toBe('Overview');
};

export const TranslateEditorActive = Template.bind({});
TranslateEditorActive.args = { ...Administrator.args, path: 'translate/GEN' };
TranslateEditorActive.play = async ({ canvasElement }) => {
  expect(activeMenuItemText(canvasElement)).toBe('Draft & review');
};

export const GenerateDraftActive = Template.bind({});
GenerateDraftActive.args = { ...Administrator.args, path: 'draft-generation' };
GenerateDraftActive.play = async ({ canvasElement }) => {
  expect(activeMenuItemText(canvasElement)).toBe('Generate draft');
};

export const ManageQuestionsActive = Template.bind({});
ManageQuestionsActive.args = { ...Administrator.args, path: 'checking' };
ManageQuestionsActive.play = async ({ canvasElement }) => {
  expect(activeMenuItemText(canvasElement)).toBe('Manage questions');
};

export const CheckingProgressActive = Template.bind({});
CheckingProgressActive.args = { ...Checker.args, path: 'checking' };
CheckingProgressActive.play = async ({ canvasElement }) => {
  expect(activeMenuItemText(canvasElement)).toBe('My progress');
};

export const CheckingAnswerQuestionsActive = Template.bind({});
CheckingAnswerQuestionsActive.args = { ...Checker.args, path: 'checking/GEN' };
CheckingAnswerQuestionsActive.play = async ({ canvasElement }) => {
  expect(activeMenuItemText(canvasElement)).toBe('Questions & answers');
};

export const SyncPageActive = Template.bind({});
SyncPageActive.args = { ...Administrator.args, path: 'sync' };
SyncPageActive.play = async ({ canvasElement }) => {
  expect(activeMenuItemText(canvasElement)).toBe('Synchronize');
};

export const UsersPageActive = Template.bind({});
UsersPageActive.args = { ...Administrator.args, path: 'users' };
UsersPageActive.play = async ({ canvasElement }) => {
  expect(activeMenuItemText(canvasElement)).toBe('Users');
};

export const SettingsPageActive = Template.bind({});
SettingsPageActive.args = { ...Administrator.args, path: 'settings' };
SettingsPageActive.play = async ({ canvasElement }) => {
  expect(activeMenuItemText(canvasElement)).toBe('Settings');
};

export const RTL = Template.bind({});
RTL.args = Default.args;
RTL.parameters = { locale: 'ar' };
