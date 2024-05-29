import { HttpClientTestingModule } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { User } from 'realtime-server/lib/esm/common/models/user';
import { createTestUser } from 'realtime-server/lib/esm/common/models/user-test-data';
import { DBL_RESOURCE_ID_LENGTH, SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { delay, of } from 'rxjs';
import { instance, mock, objectContaining, when } from 'ts-mockito';
import { TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SFUserProjectsService } from 'xforge-common/user-projects.service';
import { UserService } from 'xforge-common/user.service';
import { UserDoc } from '../../xforge-common/models/user-doc';
import { OnlineStatusService } from '../../xforge-common/online-status.service';
import { TestOnlineStatusModule } from '../../xforge-common/test-online-status.module';
import { ParatextProject } from '../core/models/paratext-project';
import { SFProjectProfileDoc } from '../core/models/sf-project-profile-doc';
import { ParatextService } from '../core/paratext.service';
import { SharedModule } from '../shared/shared.module';
import { MyProjectsComponent } from './my-projects.component';

@Component({ template: '' })
class EmptyComponent {}

const mockedActivatedRoute = mock(ActivatedRoute);
const mockedUserService = mock(UserService);
const mockedUserProjectsService = mock(SFUserProjectsService);
const mockedParatextService = mock(ParatextService);
const mockedOnlineStatusService = mock(OnlineStatusService);

type ProjectScenario = {
  code: string;
  shortNameBase: string;
  nameBase: string;
  description: string;
  userPTRole: string | null;
  projIsOnSF: boolean;
  userOnSFProject: boolean;
  isResource: boolean;
};

const projectScenarios: readonly ProjectScenario[] = [
  {
    code: 'userSFProjectNotPTRole',
    shortNameBase: 'SFNoPT',
    nameBase: 'On SF project but has no PT role',
    description: 'User has no PT role, but is on SF project.',
    userPTRole: null,
    projIsOnSF: true,
    userOnSFProject: true,
    isResource: false
  },
  {
    code: 'userSFProjectPTAdministrator',
    shortNameBase: 'SFPTA',
    nameBase: 'PT Admin on SF project',
    description: 'User PT project administrator, and is on SF project.',
    userPTRole: 'pt_administrator',
    projIsOnSF: true,
    userOnSFProject: true,
    isResource: false
  },
  {
    code: 'userSFProjectPTTranslator',
    shortNameBase: 'SFPTT',
    nameBase: 'PT Translator on SF project',
    description: 'User PT project translator, and is on SF project.',
    userPTRole: 'pt_translator',
    projIsOnSF: true,
    userOnSFProject: true,
    isResource: false
  },
  {
    code: 'userSFResource',
    shortNameBase: 'SFR',
    nameBase: 'SF resource',
    description: 'User has access to resource on SF. May or may not have access via PT.',
    userPTRole: null,
    projIsOnSF: true,
    userOnSFProject: true,
    isResource: true
  },
  {
    code: 'userPTAdministratorNotSFConnectedAtAll',
    shortNameBase: 'PTANoSF',
    nameBase: 'PT Admin for not-at-all SF',
    description: 'User PT project administrator, and project is not connected at all to SF.',
    userPTRole: 'pt_administrator',
    projIsOnSF: false,
    userOnSFProject: false,
    isResource: false
  },
  {
    code: 'userPTTranslatorNotSFConnectedAtAll',
    shortNameBase: 'PTTNoSF',
    nameBase: 'PT Translator for not-at-all SF',
    description: 'User PT project translator (not administrator), and project is but not connected at all to SF.',
    userPTRole: 'pt_translator',
    projIsOnSF: false,
    userOnSFProject: false,
    isResource: false
  },
  {
    code: 'userPTAdministratorNotConnectedToSFProject',
    shortNameBase: 'PTANotOnSFP',
    nameBase: 'PT Admin not on existing SF proj',
    description:
      'User PT project administrator, and there is a SF project, but this user is not connected to the SF project',
    userPTRole: 'pt_administrator',
    projIsOnSF: true,
    userOnSFProject: false,
    isResource: false
  },
  {
    code: 'userPTTranslatorNotConnectedToSFProject',
    shortNameBase: 'PTTNotOnSFP',
    nameBase: 'PT Translator not on existing SF proj',
    description:
      'User PT project translator, and there is a SF project, but this user is not connected to the SF project',
    userPTRole: 'pt_translator',
    projIsOnSF: true,
    userOnSFProject: false,
    isResource: false
  }
];

// App data states
type StoryAppState = {
  online: boolean;
  isKnownPTUser: boolean;
  lastSelectedProject: number;
  delayFetchingPTProjectList: boolean;
  delayFetchingSFProjectList: boolean;
  errorFetchingPTProjectList: boolean;
  errorFetchingPTProjectListUndefined: boolean;
} & {
  [K in ProjectScenario['code'] as `${K}Count`]: number;
};

const defaultArgs: StoryAppState = {
  online: true,
  isKnownPTUser: false,
  lastSelectedProject: -1,
  delayFetchingPTProjectList: false,
  delayFetchingSFProjectList: false,
  errorFetchingPTProjectList: false,
  errorFetchingPTProjectListUndefined: false,
  userSFProjectNotPTRoleCount: 0,
  userSFProjectPTAdministratorCount: 0,
  userSFProjectPTTranslatorCount: 0,
  userSFResourceCount: 0,
  userPTAdministratorNotSFConnectedAtAllCount: 0,
  userPTTranslatorNotSFConnectedAtAllCount: 0,
  userPTAdministratorNotConnectedToSFProjectCount: 0,
  userPTTranslatorNotConnectedToSFProjectCount: 0
};

const meta: Meta = {
  title: 'Components/My Projects',
  component: MyProjectsComponent,
  argTypes: {
    online: {
      description: 'Is application online'
    }
  },
  decorators: [
    moduleMetadata({
      imports: [
        HttpClientTestingModule,
        UICommonModule,
        SharedModule,
        RouterModule.forChild([
          { path: 'projects/:projectId', component: EmptyComponent },
          { path: 'connect-project', component: EmptyComponent }
        ]),
        TestOnlineStatusModule.forRoot(),
        TestTranslocoModule
      ],
      declarations: [MyProjectsComponent],
      providers: [
        provideAnimations(),
        { provide: ActivatedRoute, useValue: instance(mockedActivatedRoute) },
        { provide: UserService, useValue: instance(mockedUserService) },
        { provide: ParatextService, useValue: instance(mockedParatextService) },
        { provide: OnlineStatusService, useValue: instance(mockedOnlineStatusService) },
        { provide: SFUserProjectsService, useValue: instance(mockedUserProjectsService) }
      ]
    }),
    (story, context) => {
      // SF projects the user is connected to.
      let projectProfileDocs: SFProjectProfileDoc[] = [];
      // PT projects the user has access to.
      let userParatextProjects: ParatextProject[] = [];

      // Create the user who is viewing the page.
      const user: User = createTestUser({
        paratextId: context.args.isKnownPTUser ? 'pt-user-id' : undefined,
        sites: {
          sf: {
            projects: []
          }
        }
      });
      const userDoc = { id: 'sf-user-id', data: user };
      when(mockedUserService.getCurrentUser()).thenResolve(userDoc as UserDoc);

      // For every kind of project scenario,
      for (const scenario of projectScenarios) {
        const requestedNumberOfProjectsForScenario: number = context.args[`${scenario.code}Count`];
        // For each requested project to create for that scenario,
        for (let i = 0; i < requestedNumberOfProjectsForScenario; i++) {
          const shortName: string = scenario.shortNameBase + i;
          const ptProjectId: string = `pt-id-${shortName}`;
          const sfProjectId: string | undefined = scenario.projIsOnSF ? `sf-id-${shortName}` : undefined;
          const projectName: string = `${scenario.nameBase} ${i}`;

          // Add to list of user's SF projects that they are connected to, if appropriate.
          if (scenario.userOnSFProject) {
            const sfProjectProfile: SFProjectProfile = createTestProjectProfile({
              shortName,
              name: projectName,
              paratextId: ptProjectId
            });
            if (scenario.isResource) {
              const resourceIdLength: number = DBL_RESOURCE_ID_LENGTH;
              sfProjectProfile.paratextId = `resource-${i}-resource`.substring(0, resourceIdLength);
              sfProjectProfile.resourceConfig = {
                createdTimestamp: new Date(),
                manifestChecksum: '123',
                permissionsChecksum: '123',
                revision: 1
              };
            }
            projectProfileDocs.push({
              id: sfProjectId,
              data: sfProjectProfile
            } as SFProjectProfileDoc);
          }

          // Define whether the project is on SF at all.
          when(mockedParatextService.isParatextProjectInSF(objectContaining({ paratextId: ptProjectId }))).thenReturn(
            scenario.projIsOnSF
          );

          // Add to list of user's PT projects that they have access to, if appropriate.
          if (scenario.userPTRole != null) {
            const sfProjectExists: boolean = scenario.projIsOnSF;
            const sfUserIsOnSFProject: boolean = scenario.userOnSFProject;
            const adminOnPTProject: boolean = scenario.userPTRole === 'pt_administrator';
            // (See ParatextService.cs)
            const ptProjectIsConnectable: boolean =
              (sfProjectExists && !sfUserIsOnSFProject) || (!sfProjectExists && adminOnPTProject);
            userParatextProjects.push({
              projectId: sfProjectId,
              name: projectName,
              shortName,
              paratextId: ptProjectId,
              isConnectable: ptProjectIsConnectable,
              isConnected: sfUserIsOnSFProject
            } as ParatextProject);
          }
        }
      }

      // Set the user's current project, if requested.
      const lastSelectedProject: number = context.args.lastSelectedProject;
      if (lastSelectedProject >= 0 && lastSelectedProject < projectProfileDocs.length) {
        const lastSelectedProjectId: string = projectProfileDocs[lastSelectedProject].id;
        user.sites.sf.currentProjectId = lastSelectedProjectId;
      }

      when(mockedParatextService.getProjects()).thenCall(async () => {
        if (context.args.delayFetchingPTProjectList) await new Promise(resolve => setTimeout(resolve, 5000));
        if (context.args.errorFetchingPTProjectList) throw new Error('Error fetching PT projects');
        if (context.args.errorFetchingPTProjectListUndefined) return undefined;
        return userParatextProjects;
      });
      when(mockedUserProjectsService.projectDocs$).thenCall(() => {
        if (context.args.delayFetchingSFProjectList) return of(projectProfileDocs).pipe(delay(5000));
        else return of(projectProfileDocs);
      });
      when(mockedOnlineStatusService.onlineStatus$).thenReturn(of(context.args.online));
      when(mockedOnlineStatusService.isOnline).thenReturn(context.args.online);
      return story();
    }
  ],
  parameters: {
    controls: {
      expanded: true,
      include: Object.keys(defaultArgs)
    }
  },
  args: defaultArgs
};

export default meta;

type Story = StoryObj<StoryAppState>;

// Someone registers at SF but is not a PT user.
export const NoProjects: Story = {};

// Someone registers at SF, is not a PT user, and is offline.
export const NoProjectsOffline: Story = {
  args: { online: false }
};

// A non-PT user is working as a Community Checker.
export const SimpleChecker: Story = {
  args: { userSFProjectNotPTRoleCount: 1 }
};

// A non-PT user is working as an SF translator.
export const SimpleSFTranslator: Story = {
  args: { userSFProjectNotPTRoleCount: 1, userSFResourceCount: 1 }
};

// Someone registers at SF and has PT projects they administer.
export const NewAndPTAdmin: Story = {
  args: {
    isKnownPTUser: true,
    userPTAdministratorNotSFConnectedAtAllCount: 2,
    userPTAdministratorNotConnectedToSFProjectCount: 1
  }
};

// Someone registers at SF. They are a PT translator.
export const NewAndPTTranslator: Story = {
  args: {
    isKnownPTUser: true,
    userPTTranslatorNotSFConnectedAtAllCount: 2,
    userPTTranslatorNotConnectedToSFProjectCount: 1
  }
};

// User with PT projects they administer has connected some of them.
export const PTAdmin: Story = {
  args: {
    isKnownPTUser: true,
    userSFProjectPTAdministratorCount: 2,
    userSFResourceCount: 2,
    userPTAdministratorNotSFConnectedAtAllCount: 1,
    userPTAdministratorNotConnectedToSFProjectCount: 1
  }
};

// User with PT projects that they are a PT translator for is connected to some of them.
export const PTTranslator: Story = {
  args: {
    isKnownPTUser: true,
    userSFProjectPTTranslatorCount: 2,
    userSFResourceCount: 2,
    userPTTranslatorNotSFConnectedAtAllCount: 1,
    userPTTranslatorNotConnectedToSFProjectCount: 1
  }
};

// User has a project in every kind of scenario.
export const AllProjectScenarios: Story = {
  args: {
    isKnownPTUser: true,
    userSFProjectNotPTRoleCount: 1,
    userSFProjectPTAdministratorCount: 1,
    userSFProjectPTTranslatorCount: 1,
    userSFResourceCount: 1,
    userPTAdministratorNotSFConnectedAtAllCount: 1,
    userPTTranslatorNotSFConnectedAtAllCount: 1,
    userPTAdministratorNotConnectedToSFProjectCount: 1,
    userPTTranslatorNotConnectedToSFProjectCount: 1
  }
};

// User was last working with a particular project. That project is highlighted in the list.
export const LastSelectedProject: Story = { args: { ...PTAdmin.args, lastSelectedProject: 1 } };

// User with PT projects comes to page, and experiences delay in waiting for the PT project list to come back from the
// server.
export const PTLoading: Story = {
  args: {
    ...PTAdmin.args,
    delayFetchingPTProjectList: true
  }
};

// User with PT projects comes to page. They experience delay loading up the list of SF projects in addition to PT
// projects.
export const SFLoading: Story = {
  args: {
    ...PTAdmin.args,
    delayFetchingPTProjectList: true,
    delayFetchingSFProjectList: true
  }
};

// An error occurs while the user is fetching the PT projects list from the server.
export const PTLoadError: Story = {
  args: {
    ...PTAdmin.args,
    errorFetchingPTProjectList: true
  }
};

// Another problem happens (undefined is returned) when the user is fetching the PT projects list from the server.
export const PTLoadUndefined: Story = {
  args: {
    ...PTAdmin.args,
    errorFetchingPTProjectListUndefined: true
  }
};
