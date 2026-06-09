import { DestroyRef } from '@angular/core';
import { Router } from '@angular/router';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { defaultTranslocoMarkupTranspilers } from 'ngx-transloco-markup';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { of } from 'rxjs';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { anything, instance, mock, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { AuthService } from 'xforge-common/auth.service';
import { DialogService } from 'xforge-common/dialog.service';
import { FileService } from 'xforge-common/file.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { SFUserProjectsService } from 'xforge-common/user-projects.service';
import { UserService } from 'xforge-common/user.service';
import { ParatextProject } from '../../../core/models/paratext-project';
import { SelectableProjectWithLanguageCode } from '../../../core/models/selectable-project';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { ParatextService } from '../../../core/paratext.service';
import { SFProjectService } from '../../../core/sf-project.service';
import { TrainingDataService } from '../training-data/training-data.service';
import { ConfigureSourcesComponent } from './configure-sources.component';

const mockedActivatedProjectService = mock(ActivatedProjectService);
const mockedDestroyRef = mock(DestroyRef);
const mockedParatextService = mock(ParatextService);
const mockedProjectService = mock(SFProjectService);
const mockedUserProjectsService = mock(SFUserProjectsService);
const mockedRouter = mock(Router);
const mockedAuthService = mock(AuthService);
const mockedOnlineStatusService = mock(OnlineStatusService);
const mockedTrainingDataService = mock(TrainingDataService);
const mockedUserService = mock(UserService);
const mockedFileService = mock(FileService);

const blankProjectDoc = { id: 'project1', data: createTestProjectProfile() } as SFProjectProfileDoc;

const projectDocWithExistingSources = {
  id: 'project1',
  data: createTestProjectProfile({
    shortName: 'P_RU',
    name: 'Russian Project',
    paratextId: 'project-5',
    translateConfig: {
      translationSuggestionsEnabled: false,
      preTranslate: true,
      draftConfig: {
        draftingSources: [
          {
            paratextId: 'pt3',
            projectRef: 'sf3',
            name: 'First Drafting Source',
            shortName: 'FDS',
            writingSystem: { script: 'Latn', tag: 'es' }
          }
        ],
        trainingSources: [
          {
            paratextId: 'pt1',
            projectRef: 'sf1',
            name: 'First Training Source',
            shortName: 'FTS',
            writingSystem: { script: 'Latn', tag: 'es' }
          },
          {
            paratextId: 'pt2',
            projectRef: 'sf2',
            name: 'Second Training Source',
            shortName: 'STS',
            writingSystem: { script: 'Latn', tag: 'es' }
          }
        ]
      },
      source: {
        paratextId: 'pt0',
        projectRef: 'sf0',
        name: 'Source',
        shortName: 'SOURCE',
        writingSystem: { script: 'Latn', tag: 'es' }
      }
    }
  })
} as SFProjectProfileDoc;

function setUpMocks(args: ConfigureSourcesComponentStoryState): void {
  when(mockedActivatedProjectService.changes$).thenReturn(of(args.project));
  when(mockedActivatedProjectService.projectDoc).thenReturn(args.project);
  when(mockedAuthService.currentUserId).thenReturn('user1');

  when(mockedOnlineStatusService.onlineStatus$).thenReturn(of(args.online));
  when(mockedOnlineStatusService.isOnline).thenReturn(args.online);
  when(mockedOnlineStatusService.online).thenReturn(
    new Promise(resolve => {
      if (args.online) resolve();
      // Else, never resolve.
    })
  );

  const languageCodes = ['en', 'fr', 'es', 'pt', 'de', 'ru', 'zh', 'ar', 'hi', 'bn'];

  function languageName(code: string): string {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code;
  }

  const resources: SelectableProjectWithLanguageCode[] = new Array(10).fill(0).map((_, i) => ({
    paratextId: `resource-${i}`,
    name: `${languageName(languageCodes[i])} Resource`,
    shortName: `R_${languageCodes[i].toUpperCase()}`,
    languageTag: languageCodes[i]
  }));

  const projects: ParatextProject[] = new Array(10).fill(0).map((_, i) => ({
    paratextId: `project-${i}`,
    name: `${languageName(languageCodes[i])} Project`,
    shortName: `P_${languageCodes[i].toUpperCase()}`,
    languageTag: languageCodes[i],
    projectId: null,
    isConnectable: true,
    isConnected: true,
    hasUserRoleChanged: false,
    hasUpdate: false,
    role: SFProjectRole.ParatextObserver
  }));

  // Add a project that has no language code
  projects.push({
    paratextId: 'project-00',
    name: 'UNK',
    shortName: 'UNK',
    languageTag: '',
    projectId: null,
    isConnectable: true,
    isConnected: false,
    hasUserRoleChanged: false,
    hasUpdate: false,
    role: SFProjectRole.ParatextObserver
  });

  when(mockedParatextService.getResources()).thenResolve(resources);
  when(mockedParatextService.getProjects()).thenResolve(projects);
  when(mockedUserProjectsService.projectDocs$).thenReturn(of([args.project]));
  when(mockedTrainingDataService.getTrainingData(anything(), anything())).thenReturn(of([]));
}

interface ConfigureSourcesComponentStoryState {
  project: SFProjectProfileDoc;
  online: boolean;
}

const defaultArgs: ConfigureSourcesComponentStoryState = {
  project: blankProjectDoc,
  online: true
};

export default {
  title: 'Draft/ConfigureSources',
  component: ConfigureSourcesComponent,
  decorators: [
    moduleMetadata({
      providers: [
        { provide: ActivatedProjectService, useValue: instance(mockedActivatedProjectService) },
        { provide: DestroyRef, useValue: instance(mockedDestroyRef) },
        { provide: ParatextService, useValue: instance(mockedParatextService) },
        { provide: DialogService, useClass: DialogService },
        { provide: SFProjectService, useValue: instance(mockedProjectService) },
        { provide: SFUserProjectsService, useValue: instance(mockedUserProjectsService) },
        { provide: Router, useValue: instance(mockedRouter) },
        { provide: AuthService, useValue: instance(mockedAuthService) },
        { provide: OnlineStatusService, useValue: instance(mockedOnlineStatusService) },
        { provide: TrainingDataService, useValue: instance(mockedTrainingDataService) },
        { provide: UserService, useValue: instance(mockedUserService) },
        { provide: FileService, useValue: instance(mockedFileService) },
        defaultTranslocoMarkupTranspilers()
      ]
    })
  ],
  render: args => {
    setUpMocks(args);
    return { template: `<app-configure-sources></app-configure-sources>` };
  },
  args: defaultArgs,
  parameters: {
    controls: {
      include: Object.keys(defaultArgs)
    }
  },
  argTypes: {}
} as Meta<ConfigureSourcesComponentStoryState>;

type Story = StoryObj<ConfigureSourcesComponentStoryState>;

const Template: Story = {};

/**
 * Selects the specified project or resource from a project selector. If there are multiple selectors, specify the index
 *  (otherwise the first will be used)
 */
async function selectSource(
  canvasElement: HTMLElement,
  fieldName: 'training_a' | 'training_b' | 'drafting',
  shortName: string
): Promise<void> {
  const canvas = within(canvasElement);
  const sourceInput = await getSourceElement(canvasElement, fieldName);
  await userEvent.clear(sourceInput);
  await userEvent.type(sourceInput, shortName);
  const item = await canvas.findByRole('option', { name: new RegExp(shortName) });
  await userEvent.click(item);
}

async function clearSource(
  canvasElement: HTMLElement,
  fieldName: 'training_a' | 'training_b' | 'drafting'
): Promise<void> {
  const sourceInput = await getSourceElement(canvasElement, fieldName);
  await userEvent.click(sourceInput);
  await userEvent.clear(sourceInput);
}

async function getSourceElement(
  canvasElement: HTMLElement,
  fieldName: 'training_a' | 'training_b' | 'drafting'
): Promise<HTMLElement> {
  const trainingSourcesWrapper = canvasElement.querySelectorAll('.inputs-source-side')[0] as HTMLElement;
  const draftingSourceWrapper = canvasElement.querySelectorAll('.inputs-source-side')[1] as HTMLElement;
  if (fieldName === 'training_a') {
    return (await within(trainingSourcesWrapper).findAllByRole('combobox'))[0];
  } else if (fieldName === 'training_b') {
    return (await within(trainingSourcesWrapper).findAllByRole('combobox'))[1];
  } else if (fieldName === 'drafting') {
    return await within(draftingSourceWrapper).findByRole('combobox');
  } else throw new Error(`Unknown field name ${fieldName}`);
}

async function warning(canvasElement: HTMLElement): Promise<string | null> {
  const canvas = within(canvasElement.querySelector('app-language-codes-confirmation')!);
  return canvas.getByRole('heading').textContent;
}

export const Default: Story = {
  ...Template
};

export const PreExistingSettings: Story = {
  ...Template,
  args: {
    project: projectDocWithExistingSources
  }
};

export const SelectAllAndSave: Story = {
  ...Template,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Step 1: Reference projects
    // Select an English reference and expect to see a warning that source and target languages are the same
    await selectSource(canvasElement, 'training_a', 'P_EN');
    expect(await warning(canvasElement)).toContain('Source and target languages are both English');
    // Switch to a Chinese reference project and expect the error to disappear
    await clearSource(canvasElement, 'training_a');
    await selectSource(canvasElement, 'training_a', 'R_ZH');
    expect(await warning(canvasElement)).toContain('Incorrect language codes will dramatically reduce draft quality.');
    // Add a second reference project
    const additionalReferenceButton = canvas.getByRole('button', { name: /Add another reference project/ });
    await userEvent.click(additionalReferenceButton);
    await selectSource(canvasElement, 'training_b', 'P_ZH');

    // Step 2: Draft source
    // Select an English source project and expect to see an error that sources are in different languages
    await selectSource(canvasElement, 'drafting', 'R_EN');
    expect(await warning(canvasElement)).toContain('All source and reference projects must be in the same language');
    // Switch to a Chinese source project and expect the error to disappear
    await clearSource(canvasElement, 'drafting');
    await selectSource(canvasElement, 'drafting', 'P_ZH');
    expect(await warning(canvasElement)).toContain('Incorrect language codes will dramatically reduce draft quality.');

    // Verify general information  shown is correct
    const overviewHeadings = Array.from(canvasElement.querySelectorAll('h2')).map(e => e.textContent.trim());
    expect(overviewHeadings).toEqual([
      'Reference  - Chinese (zh)',
      'Translated project  - English (en)',
      'Source  - Chinese (zh)'
    ]);

    // Click save and ensure we are informed that we need to confirm language codes
    await userEvent.click(await canvas.findByRole('button', { name: /Save & sync/ }));
    canvas.getByRole('heading', { name: 'Please confirm that the language codes are correct before saving.' });
    await userEvent.click(canvas.getByRole('button', { name: /Close/ }));

    // Click the checkbox to confirm the language codes are correct
    await userEvent.click(await canvas.findByRole('checkbox'));
    await userEvent.click(canvas.getByRole('button', { name: /Save & sync/ }));
    canvas.getByText('Saving draft sources');
  }
};

export const DefaultOnMobile = {
  ...Template,
  globals: {
    viewport: { value: 'mobile1' }
  }
};

export const PreExistingSettingsOnMobile = {
  ...PreExistingSettings,
  globals: {
    viewport: { value: 'mobile1' }
  }
};

export const SelectAllAndSaveOnMobile = {
  ...SelectAllAndSave,
  globals: {
    viewport: { value: 'mobile1' }
  }
};

export const CannotSaveWithoutReferenceProject = {
  ...PreExistingSettings,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await clearSource(canvasElement, 'training_a');
    await clearSource(canvasElement, 'training_b');
    await userEvent.click(canvas.getByRole('button', { name: /Save & sync/ }));
    canvas.getByRole('heading', { name: 'Please select at least one reference project before saving.' });
  }
};

export const CannotSaveWithoutDraftingSource = {
  ...PreExistingSettings,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await clearSource(canvasElement, 'drafting');
    await userEvent.click(canvas.getByRole('button', { name: /Save & sync/ }));
    canvas.getByRole('heading', { name: 'Please select at least one source project before saving.' });
  }
};

export const CannotSelectSameProjectTwiceInOneStep: Story = {
  ...Default,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Select English project
    await selectSource(canvasElement, 'training_a', 'P_EN');
    await userEvent.click(canvas.getByRole('button', { name: /Add another reference project/ }));
    // Wait for the project select menu to fully close
    await waitFor(() => expect(canvas.queryAllByRole('option').length).toBe(0));

    // Make sure English project can't be selected in second project select
    await userEvent.click(canvas.getAllByRole('combobox')[1]);
    expect(canvas.queryByRole('option', { name: /P_EN/ })).toBeNull();
    expect(canvas.queryByRole('option', { name: /R_EN/ })).not.toBeNull();
  }
};

export const CannotSelectTargetAsASource: Story = {
  ...PreExistingSettings,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Make sure current target Russian project can't be selected as a training source
    await userEvent.click(canvas.getAllByRole('combobox')[1]);
    expect(canvas.queryByRole('option', { name: /P_ES/ })).not.toBeNull();
    expect(canvas.queryByRole('option', { name: /P_RU/ })).toBeNull();

    // Make sure current target Russian project can't be selected as a drafting source
    await userEvent.click(canvas.getAllByRole('combobox')[3]);
    expect(canvas.queryByRole('option', { name: /P_ES/ })).not.toBeNull();
    expect(canvas.queryByRole('option', { name: /P_RU/ })).toBeNull();
  }
};

export const LanguageCodesConfirmationAutomaticallyCleared: Story = {
  ...Default,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await selectSource(canvasElement, 'training_a', 'P_EN');

    await userEvent.click(await canvas.findByRole('checkbox'));
    expect(await canvas.findByRole('checkbox')).toBeChecked();

    // Clearing the source doesn't clear the checkbox
    await clearSource(canvasElement, 'training_a');
    expect(await canvas.findByRole('checkbox')).toBeChecked();

    // Selecting a source does clear the checkbox
    await selectSource(canvasElement, 'training_a', 'P_EN');
    expect(await canvas.findByRole('checkbox')).not.toBeChecked();
  }
};

export const CannotSaveWithMultipleSourceLanguages: Story = {
  ...Default,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Select Portuguese along with Spanish on the source side
    await selectSource(canvasElement, 'training_a', 'R_PT');
    const additionalReferenceButton = canvas.getByRole('button', { name: /Add another reference project/ });
    await userEvent.click(additionalReferenceButton);
    await selectSource(canvasElement, 'training_b', 'P_ES');
    await selectSource(canvasElement, 'drafting', 'P_PT');

    // Expect an error with no checkbox to confirm language codes
    expect(await warning(canvasElement)).toContain('All source and reference projects must be in the same language');
    expect(canvas.queryByRole('checkbox')).toBeNull();

    // Attempting to save should show an error dialog
    await userEvent.click(canvas.getByRole('button', { name: /Save & sync/ }));
    canvas.getByRole('heading', {
      name: 'All source and reference projects must be in the same language. Please select different source or reference projects.'
    });
  }
};

// See SF-3288
export const CanHandleBackTranslationProjectsWithUnknownLanguage: Story = {
  ...Default,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Select a training source that does not have a language code defined
    await selectSource(canvasElement, 'training_a', 'P_ES');
    await userEvent.click(canvas.getByRole('button', { name: /Add another reference project/ }));
    await selectSource(canvasElement, 'training_b', 'UNK');
    await selectSource(canvasElement, 'drafting', 'R_ES');

    expect(await warning(canvasElement)).toContain('Incorrect language codes will dramatically reduce draft quality.');
  }
};

// See SF-3271
export const CannotSaveAndSyncWhenOffline: Story = {
  args: {
    project: blankProjectDoc,
    online: false
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const offlineMessage = canvasElement.querySelector('mat-error')?.textContent ?? '';
    // Offline message is displayed
    expect(offlineMessage).toContain(
      'You are offline. Please connect to the internet to save and sync your draft sources.'
    );
    // Save button is disabled
    expect(canvas.getByRole('button', { name: /Save & sync/ })).toBeDisabled();
  }
};
