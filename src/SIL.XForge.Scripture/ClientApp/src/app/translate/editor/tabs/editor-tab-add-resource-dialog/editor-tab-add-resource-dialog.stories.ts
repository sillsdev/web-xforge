import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideAnimations } from '@angular/platform-browser/animations';
import { Meta, moduleMetadata } from '@storybook/angular';
import { of } from 'rxjs';
import { instance, mock, when } from 'ts-mockito';
import { I18nStoryModule } from 'xforge-common/i18n-story.module';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { XForgeCommonModule } from 'xforge-common/xforge-common.module';
import {
  MatDialogLaunchComponent,
  matDialogStory,
  MatDialogStoryConfig
} from '../../../../../../.storybook/util/mat-dialog-launch';
import { ParatextProject } from '../../../../core/models/paratext-project';
import { ParatextService } from '../../../../core/paratext.service';
import { PermissionsService } from '../../../../core/permissions.service';
import { SFProjectService } from '../../../../core/sf-project.service';
import {
  EditorTabAddResourceDialogComponent,
  EditorTabAddResourceDialogData
} from './editor-tab-add-resource-dialog.component';
import { EditorTabAddResourceDialogService } from './editor-tab-add-resource-dialog.service';

const mockEditorTabAddResourceDialogService = mock(EditorTabAddResourceDialogService);
const mockSFProjectService = mock(SFProjectService);
const mockParatextService = mock(ParatextService);
const mockMatDialogRef = mock(MatDialogRef);
const mockPermissionsService = mock(PermissionsService);
const mockOnlineStatusService = mock(OnlineStatusService);

/** See also editor-tab-add-resource-dialog.component.spec.ts createTestParatextProject(). */
function createTestParatextProject(index: number, overrides?: Partial<ParatextProject>): ParatextProject {
  return {
    paratextId: `ptId${index}`,
    name: `Paratext Project ${index}`,
    shortName: `PTProject${index}`,
    languageTag: 'en',
    projectId: `projectId${index}`,
    isConnectable: true,
    isConnected: false,
    hasUserRoleChanged: false,
    hasUpdate: false,
    ...overrides
  };
}

// Different situations that the story might happen in.
interface StoryAppState {
  online: boolean;
  stillFetchingProjects: boolean;
  undefinedProjectsAndResources: boolean;
  errorLoadingProjectList: boolean;
  data: EditorTabAddResourceDialogData;
}

// Default values for story situations.
const defaultArgs: StoryAppState = {
  online: true,
  stillFetchingProjects: false,
  undefinedProjectsAndResources: false,
  errorLoadingProjectList: false,
  data: { excludedParatextIds: [] }
};

const meta: Meta = {
  title: 'Translate/Editor/Tabs/Add resource dialog',
  component: MatDialogLaunchComponent,
  decorators: [
    moduleMetadata({}),
    (story, context) => {
      // Apply selected situations to a story.

      when(mockOnlineStatusService.onlineStatus$).thenReturn(of(context.args.online));
      when(mockOnlineStatusService.onlineBrowserStatus$).thenReturn(of(context.args.online));
      when(mockOnlineStatusService.isOnline).thenReturn(context.args.online);
      when(mockOnlineStatusService.isBrowserOnline).thenReturn(context.args.online);
      when(mockOnlineStatusService.online).thenReturn(
        new Promise(resolve => {
          if (context.args.online) resolve();
          // Else, never resolve.
        })
      );

      let projects: ParatextProject[] | undefined = [createTestParatextProject(1), createTestParatextProject(2)];
      let resources: ParatextProject[] | undefined = [createTestParatextProject(3), createTestParatextProject(4)];
      if (context.args.undefinedProjectsAndResources === true) {
        projects = undefined;
        resources = undefined;
      }

      when(mockEditorTabAddResourceDialogService.getProjects()).thenReturn(Promise.resolve(projects));
      when(mockEditorTabAddResourceDialogService.getResources()).thenReturn(Promise.resolve(resources));

      if (context.args.stillFetchingProjects) {
        when(mockEditorTabAddResourceDialogService.getProjects()).thenReturn(
          new Promise((_resolve, _reject) => {
            // Never resolve.
          })
        );
      }

      if (context.args.errorLoadingProjectList || context.args.online === false) {
        when(mockEditorTabAddResourceDialogService.getProjects()).thenReject(new Error('Problem'));
        when(mockEditorTabAddResourceDialogService.getResources()).thenReject(new Error('Problem'));
      }

      return story();
    }
  ],
  parameters: {
    controls: {
      expanded: true,
      include: Object.keys(defaultArgs)
    },
    viewport: { defaultViewport: 'mobile1' }
  },
  args: defaultArgs
};
export default meta;

const dialogStoryConfig: MatDialogStoryConfig = {
  imports: [XForgeCommonModule, I18nStoryModule],
  providers: [
    provideAnimations(),
    { provide: EditorTabAddResourceDialogService, useValue: instance(mockEditorTabAddResourceDialogService) },
    { provide: SFProjectService, useValue: instance(mockSFProjectService) },
    { provide: ParatextService, useValue: instance(mockParatextService) },
    { provide: PermissionsService, useValue: instance(mockPermissionsService) },
    { provide: MatDialogRef, useValue: instance(mockMatDialogRef) },
    { provide: OnlineStatusService, useValue: instance(mockOnlineStatusService) },
    { provide: MAT_DIALOG_DATA, useValue: {} }
  ],
  declarations: [EditorTabAddResourceDialogComponent],
  standaloneComponent: true
};

// List of stories.

// The dialog opens for the user and successfully fetches projects and resources.
export const Loaded = matDialogStory(EditorTabAddResourceDialogComponent, dialogStoryConfig);
Loaded.args = {};
Loaded.parameters = { chromatic: { disableSnapshot: true } };

// The dialog opens for the user and has not yet finished fetching projects or resources.
export const Loading = matDialogStory(EditorTabAddResourceDialogComponent, dialogStoryConfig);
Loading.args = { stillFetchingProjects: true };

// The project and resource lists might be given to us as undefined.
export const LoadedUndefinedProjectsAndResources = matDialogStory(
  EditorTabAddResourceDialogComponent,
  dialogStoryConfig
);
LoadedUndefinedProjectsAndResources.args = { undefinedProjectsAndResources: true };

// The dialog opens for the user and has an error when fetching the project and resource lists.
export const ErrorLoadingProjectListOnline = matDialogStory(EditorTabAddResourceDialogComponent, dialogStoryConfig);
ErrorLoadingProjectListOnline.args = { errorLoadingProjectList: true };

// The dialog opens for the user and has an error when fetching the project and resource lists. Possibly because the
// user is offline.
export const ErrorLoadingProjectListOffline = matDialogStory(EditorTabAddResourceDialogComponent, dialogStoryConfig);
ErrorLoadingProjectListOffline.args = { online: false, errorLoadingProjectList: true };
