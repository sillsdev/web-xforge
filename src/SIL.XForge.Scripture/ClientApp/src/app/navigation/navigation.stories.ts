import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { Meta, StoryFn } from '@storybook/angular';
import { CheckingAnswerExport } from 'realtime-server/lib/esm/scriptureforge/models/checking-config';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { anything, instance, mock, when } from 'ts-mockito';
import { AuthGuard } from 'xforge-common/auth.guard';
import { AuthService } from 'xforge-common/auth.service';
import { I18nStoryModule } from 'xforge-common/i18n-story.module';
import { PwaService } from 'xforge-common/pwa.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from '../core/models/sf-project-profile-doc';
import { SFProjectService } from '../core/sf-project.service';
import { SettingsAuthGuard, SyncAuthGuard, UsersAuthGuard } from '../shared/project-router.guard';
import { NavigationComponent } from './navigation.component';

const mockedPwaService = mock(PwaService);
const mockedSFProjectService = mock(SFProjectService);
const mockedUserService = mock(UserService);
const mockedAuthService = mock(AuthService);
const mockedActivatedRoute = mock(ActivatedRoute);

function setUpMocksAndGetProjectDoc(_args: any, context: any): SFProjectProfileDoc {
  const userId = 'user01';

  const project: SFProjectProfile = {
    name: 'Test Project',
    paratextId: 'pt01',
    shortName: 'TP',
    writingSystem: {
      tag: 'en'
    },
    translateConfig: {
      translationSuggestionsEnabled: true,
      shareEnabled: false
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
    editable: true,
    userRoles: {
      [userId]: context.args.role
    },
    userPermissions: {}
  };

  const projectDoc = { id: 'project01', data: project } as any as SFProjectProfileDoc;

  when(mockedAuthService.isLoggedIn).thenResolve(true);
  when(mockedUserService.currentUserId).thenReturn(userId);
  when(mockedPwaService.isOnline).thenReturn(context.args.online);
  when(mockedSFProjectService.getUserConfig(anything(), anything())).thenResolve({} as any);
  when(mockedSFProjectService.getProfile(anything())).thenResolve(projectDoc);

  return projectDoc;
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

const Template: StoryFn = (args, context) => ({
  moduleMetadata: {
    imports: [UICommonModule, CommonModule, I18nStoryModule],
    providers: [
      { provide: AuthGuard, useClass: AuthGuard },
      { provide: SettingsAuthGuard, useClass: SettingsAuthGuard },
      { provide: SyncAuthGuard, useClass: SyncAuthGuard },
      { provide: UsersAuthGuard, useClass: UsersAuthGuard },

      { provide: AuthService, useValue: instance(mockedAuthService) },
      { provide: PwaService, useValue: instance(mockedPwaService) },
      { provide: SFProjectService, useValue: instance(mockedSFProjectService) },
      { provide: UserService, useValue: instance(mockedUserService) },
      { provide: ActivatedRoute, useValue: instance(mockedActivatedRoute) },
      { provide: SwUpdate, useValue: instance(mockedSwUpdate) }
    ]
  },
  template: `
      <div style="width: 255px; height: 600px;">
        <app-navigation [selectedProjectDoc]="selectedProjectDoc"></app-navigation>
      </div>
    `,
  props: {
    selectedProjectDoc: setUpMocksAndGetProjectDoc(args, context)
  }
});

export const Default: Story = Template.bind({});
Default.args = {
  role: SFProjectRole.ParatextAdministrator,
  online: true,
  syncInProgress: false,
  lastSyncSuccessful: true,
  checkingEnabled: true
};

export const Administrator: Story = Template.bind({});
Administrator.args = { ...Default.args, role: SFProjectRole.ParatextAdministrator };

export const Translator: Story = Template.bind({});
Translator.args = { ...Default.args, role: SFProjectRole.ParatextTranslator };

export const Consultant: Story = Template.bind({});
Consultant.args = { ...Default.args, role: SFProjectRole.ParatextConsultant };

export const Observer: Story = Template.bind({});
Observer.args = { ...Default.args, role: SFProjectRole.ParatextObserver };

export const Checker: Story = Template.bind({});
Checker.args = { ...Default.args, role: SFProjectRole.CommunityChecker };

export const Viewer: Story = Template.bind({});
Viewer.args = { ...Default.args, role: SFProjectRole.Viewer };

export const Commenter: Story = Template.bind({});
Commenter.args = { ...Default.args, role: SFProjectRole.Commenter };

export const SyncInProgress: Story = Template.bind({});
SyncInProgress.args = { ...Default.args, syncInProgress: true };

export const SyncFailed: Story = Template.bind({});
SyncFailed.args = { ...Default.args, lastSyncSuccessful: false };

export const Offline: Story = Template.bind({});
Offline.args = { ...Default.args, online: false };

export const CheckingDisabled: Story = Template.bind({});
CheckingDisabled.args = { ...Default.args, checkingEnabled: false };
