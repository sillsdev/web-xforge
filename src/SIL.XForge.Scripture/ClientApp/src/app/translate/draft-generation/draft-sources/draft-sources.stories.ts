import { DestroyRef } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { expect, userEvent, waitFor, within } from '@storybook/test';
import { defaultTranslocoMarkupTranspilers } from 'ngx-transloco-markup';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { of } from 'rxjs';
import { instance, mock, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { AuthService } from 'xforge-common/auth.service';
import { DialogService } from 'xforge-common/dialog.service';
import { createTestFeatureFlag, FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { SFUserProjectsService } from 'xforge-common/user-projects.service';
import { ParatextProject } from '../../../core/models/paratext-project';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { ParatextService, SelectableProjectWithLanguageCode } from '../../../core/paratext.service';
import { SFProjectService } from '../../../core/sf-project.service';
import { DraftSourcesComponent } from '../../../translate/draft-generation/draft-sources/draft-sources.component';

const mockedActivatedProjectService = mock(ActivatedProjectService);
const mockedDestroyRef = mock(DestroyRef);
const mockedParatextService = mock(ParatextService);
const mockedProjectService = mock(SFProjectService);
const mockedUserProjectsService = mock(SFUserProjectsService);
const mockedRouter = mock(Router);
const mockedFeatureFlags = mock(FeatureFlagService);
const mockedAuthService = mock(AuthService);

const blankProjectDoc = { id: 'project1', data: createTestProjectProfile() } as SFProjectProfileDoc;

const projectDocWithExistingSources = {
  id: 'project1',
  data: createTestProjectProfile({
    translateConfig: {
      translationSuggestionsEnabled: false,
      preTranslate: true,
      draftConfig: {
        additionalTrainingSourceEnabled: true,
        alternateSourceEnabled: true,
        alternateTrainingSourceEnabled: true,
        alternateTrainingSource: {
          paratextId: 'pt1',
          projectRef: 'sf1',
          name: 'Alternate Training Source',
          shortName: 'ALT-TS',
          writingSystem: { script: 'Latn', tag: 'es' }
        },
        additionalTrainingSource: {
          paratextId: 'pt2',
          projectRef: 'sf2',
          name: 'Additional Training Source',
          shortName: 'ADD-TS',
          writingSystem: { script: 'Latn', tag: 'es' }
        },
        alternateSource: {
          paratextId: 'pt3',
          projectRef: 'sf3',
          name: 'Alternate Source',
          shortName: 'AS',
          writingSystem: { script: 'Latn', tag: 'es' }
        }
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

function setUpMocks(args: DraftSourcesComponentStoryState): void {
  when(mockedActivatedProjectService.changes$).thenReturn(of(args.project));
  when(mockedActivatedProjectService.projectDoc).thenReturn(args.project);
  when(mockedFeatureFlags.allowAdditionalTrainingSource).thenReturn(createTestFeatureFlag(args.mixedSource));
  when(mockedAuthService.currentUserId).thenReturn('user1');

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
    projectId: `project-${i}`,
    isConnectable: true,
    isConnected: true
  }));

  when(mockedParatextService.getResources()).thenResolve(resources);
  when(mockedParatextService.getProjects()).thenResolve(projects);
  when(mockedUserProjectsService.projectDocs$).thenReturn(of([args.project]));
}

interface DraftSourcesComponentStoryState {
  project: SFProjectProfileDoc;
  mixedSource: boolean;
}

const defaultArgs: DraftSourcesComponentStoryState = {
  project: blankProjectDoc,
  mixedSource: true
};

export default {
  title: 'Draft/DraftSources',
  component: DraftSourcesComponent,
  decorators: [
    moduleMetadata({
      imports: [MatDialogModule],
      providers: [
        { provide: ActivatedProjectService, useValue: instance(mockedActivatedProjectService) },
        { provide: DestroyRef, useValue: instance(mockedDestroyRef) },
        { provide: ParatextService, useValue: instance(mockedParatextService) },
        { provide: DialogService, useClass: DialogService },
        { provide: SFProjectService, useValue: instance(mockedProjectService) },
        { provide: SFUserProjectsService, useValue: instance(mockedUserProjectsService) },
        { provide: Router, useValue: instance(mockedRouter) },
        { provide: FeatureFlagService, useValue: instance(mockedFeatureFlags) },
        { provide: AuthService, useValue: instance(mockedAuthService) },
        defaultTranslocoMarkupTranspilers()
      ]
    })
  ],
  render: args => {
    setUpMocks(args);
    return { template: `<app-draft-sources></app-draft-sources>` };
  },
  args: defaultArgs,
  parameters: {
    controls: {
      include: Object.keys(defaultArgs)
    },
    viewport: { defaultViewport: 'responsive' }
  },
  argTypes: {}
} as Meta<DraftSourcesComponentStoryState>;

type Story = StoryObj<DraftSourcesComponentStoryState>;

const Template: Story = {};

/**
 * Selects the specified project or resource from a project selector. If there are multiple selectors, specify the index
 *  (otherwise the first will be used)
 */
async function selectSource(canvasElement: HTMLElement, shortName: string, inputIndex = 0): Promise<void> {
  const canvas = within(canvasElement);
  const sourceInput = (await canvas.findAllByRole('combobox'))[inputIndex];
  await userEvent.type(sourceInput, shortName);
  const item = await canvas.findByRole('option', { name: new RegExp(shortName) });
  await userEvent.click(item);
}

async function clearSource(canvasElement: HTMLElement, inputIndex = 0): Promise<void> {
  const canvas = within(canvasElement);
  const sourceInput = (await canvas.findAllByRole('combobox'))[inputIndex];
  await userEvent.click(sourceInput);
  await userEvent.clear(sourceInput);
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
    // Step 1: Draft source
    // Select an English source and expect to see a warning that source and target languages are the same
    await selectSource(canvasElement, 'P_EN');
    expect(await warning(canvasElement)).toContain('Source and target languages are both English');
    // Switch to a Chinese source and expect the warning to disappear
    await clearSource(canvasElement);
    await selectSource(canvasElement, 'P_ZH');
    expect(await warning(canvasElement)).toContain('Incorrect language codes will dramatically reduce draft quality.');

    // Step 2: Reference projects
    await userEvent.click(canvas.getByRole('button', { name: /Next/ }));
    // Select a English reference project and expect to see an error that sources are in different languages
    await selectSource(canvasElement, 'R_EN');
    expect(await warning(canvasElement)).toContain('All source and reference projects must be in the same language');
    // Switch to a Chinese reference project and expect the error to disappear
    await clearSource(canvasElement);
    await selectSource(canvasElement, 'R_ZH');
    expect(await warning(canvasElement)).toContain('Incorrect language codes will dramatically reduce draft quality.');
    // Add a second reference project
    const additionalReferenceButton = canvas.getByRole('button', { name: /Add another reference project/ });
    await userEvent.click(additionalReferenceButton);
    await selectSource(canvasElement, 'P_ZH', 1);
    await userEvent.click(canvas.getByRole('button', { name: /Next/ }));

    // Verify general information shown is correct
    const stepSubTitles = Array.from(canvasElement.querySelectorAll('.step-subtitle')).map(e => e.textContent);
    expect(stepSubTitles).toEqual(['P_ZH', 'R_ZH and P_ZH', 'P1']);
    const overviewHeadings = Array.from(canvasElement.querySelector('.overview')!.querySelectorAll('h3')).map(
      e => e.textContent
    );
    expect(overviewHeadings).toEqual(['Reference (Chinese)', 'Translated project (English)', 'Source (Chinese)']);

    // Click cancel, and ensure settings are not accidentally lost without confirmation
    await userEvent.click(canvas.getByRole('button', { name: /Cancel/ }));
    await userEvent.click(canvas.getByRole('button', { name: /Stay on page/ }));

    // // Click save and ensure we are informed that we need to confirm language codes
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
  parameters: {
    viewport: { defaultViewport: 'mobile1' }
  }
};

export const PreExistingSettingsOnMobile = {
  ...PreExistingSettings,
  parameters: {
    viewport: { defaultViewport: 'mobile1' }
  }
};

export const SelectAllAndSaveOnMobile = {
  ...SelectAllAndSave,
  parameters: {
    viewport: { defaultViewport: 'mobile1' }
  }
};

/**
 * Tests that the stepper headers, next/back buttons, and overview can be used to navigate between steps, and that the
 * stepper and overview are in sync with each other at all times.
 */
export const NavigateAllSteps: Story = {
  ...PreExistingSettings,
  play: async ({ canvasElement }) => {
    const stepTitles = {
      1: { stepper: 'Draft source', overview: 'Source' },
      2: { stepper: 'Reference projects', overview: 'Reference' },
      3: { stepper: 'Target language data', overview: 'Translated project' }
    };

    function currentStep(canvasElement: HTMLElement): number {
      const stepperHeading = canvasElement.querySelector('.draft-sources-stepper .active .step-title')!.textContent!;
      const overviewHeading = canvasElement.querySelector('.overview .active h3')!.textContent!;

      for (const [step, titles] of Object.entries(stepTitles)) {
        if (stepperHeading === titles.stepper && overviewHeading?.indexOf(titles.overview) === 0) {
          return Number.parseInt(step);
        }
      }
      throw new Error('Component does not appear to be in a valid state');
    }

    const canvas = within(canvasElement);
    // Go to each step by clicking the next button, and then by clicking the back button
    expect(currentStep(canvasElement)).toBe(1);
    await userEvent.click(canvas.getByRole('button', { name: /Next/ }));
    expect(currentStep(canvasElement)).toBe(2);
    await userEvent.click(canvas.getByRole('button', { name: /Next/ }));
    expect(currentStep(canvasElement)).toBe(3);
    await userEvent.click(within(canvasElement).getByRole('button', { name: /Previous/ }));
    expect(currentStep(canvasElement)).toBe(2);
    await userEvent.click(within(canvasElement).getByRole('button', { name: /Previous/ }));
    expect(currentStep(canvasElement)).toBe(1);
    // Go to each step by clicking on the stepper
    for (let step = 1; step <= 3; step++) {
      await userEvent.click(canvas.getByText(stepTitles[step].stepper));
      expect(currentStep(canvasElement)).toBe(step);
    }
    // Go to each step by clicking in the overview
    for (let step = 1; step <= 3; step++) {
      await userEvent.click(canvas.getByRole('heading', { level: 3, name: new RegExp(stepTitles[step].overview) }));
      expect(currentStep(canvasElement)).toBe(step);
    }
  }
};

export const CannotSaveWithoutDraftingSource = {
  ...PreExistingSettings,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await clearSource(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /Save & sync/ }));
    canvas.getByRole('heading', { name: 'Please select at least one source project before saving.' });
  }
};

export const CannotSaveWithoutReferenceProject = {
  ...PreExistingSettings,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /Next/ }));
    expect(canvas.getAllByRole('combobox').length).toBe(2);
    await clearSource(canvasElement);
    expect(canvas.getAllByRole('combobox').length).toBe(2);
    await clearSource(canvasElement, 1);
    // The number of project selects drops to 1 only after both are cleared
    expect(canvas.getAllByRole('combobox').length).toBe(1);
    await userEvent.click(canvas.getByRole('button', { name: /Save & sync/ }));
    canvas.getByRole('heading', { name: 'Please select at least one reference project before saving.' });
  }
};

export const CannotSelectSameProjectTwiceInOneStep: Story = {
  ...Default,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Select English project
    await userEvent.click(canvas.getByRole('button', { name: /Next/ }));
    await selectSource(canvasElement, 'P_EN');
    await userEvent.click(canvas.getByRole('button', { name: /Add another reference project/ }));
    // Wait for the project select menu to fully close
    await waitFor(() => expect(canvas.queryAllByRole('option').length).toBe(0));

    // Make sure English project can't be selected in second project select
    await userEvent.click(canvas.getAllByRole('combobox')[1]);
    expect(canvas.queryByRole('option', { name: /P_EN/ })).toBeNull();
    expect(canvas.queryByRole('option', { name: /R_EN/ })).not.toBeNull();

    // Verify empty project select is removed when leaving and coming back to step
    await userEvent.click(canvas.getByRole('button', { name: /Next/ }));
    await userEvent.click(canvas.getByRole('button', { name: /Previous/ }));
    expect(canvas.getAllByRole('combobox').length).toBe(1);
    canvas.getByRole('button', { name: /Add another reference project/ });
  }
};

export const LanguageCodesConfirmationAutomaticallyCleared: Story = {
  ...Default,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await selectSource(canvasElement, 'P_EN');

    await userEvent.click(await canvas.findByRole('checkbox'));
    expect(await canvas.findByRole('checkbox')).toBeChecked();

    // Clearing the source doesn't clear the checkbox
    await clearSource(canvasElement);
    expect(await canvas.findByRole('checkbox')).toBeChecked();

    // Selecting a source does clear the checkbox
    await selectSource(canvasElement, 'P_EN');
    expect(await canvas.findByRole('checkbox')).not.toBeChecked();
  }
};

export const CannotSaveWithMultipleSourceLanguages: Story = {
  ...Default,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Select Portuguese along with Spanish on the source side
    await selectSource(canvasElement, 'P_PT');
    await userEvent.click(canvas.getByRole('button', { name: /Next/ }));
    await selectSource(canvasElement, 'R_PT');
    const additionalReferenceButton = canvas.getByRole('button', { name: /Add another reference project/ });
    await userEvent.click(additionalReferenceButton);
    await selectSource(canvasElement, 'P_ES', 1);

    // Expect an error with no checkbox to confirm language codes
    expect(await warning(canvasElement)).toContain('All source and reference projects must be in the same language');
    expect(canvas.queryByRole('checkbox')).toBeNull();

    // Attempting to save should show an error dialog
    await userEvent.click(canvas.getByRole('button', { name: /Save & sync/ }));
    canvas.getByRole('heading', {
      name: 'All source and reference projects must be in the same language. Please select different source or reference projects.'
    });
    await userEvent.click(canvas.getByRole('button', { name: 'Close' }));

    // Clearing the Spanish source should remove the error
    await clearSource(canvasElement, 1);
    expect(await warning(canvasElement)).toContain('Incorrect language codes will dramatically reduce draft quality.');
  }
};
