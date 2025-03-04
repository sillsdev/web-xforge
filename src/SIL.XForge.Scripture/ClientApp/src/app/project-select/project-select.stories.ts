import { TranslocoModule } from '@ngneat/transloco';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { expect, within } from '@storybook/test';
import userEvent from '@testing-library/user-event';
import { I18nStoryModule } from 'xforge-common/i18n-story.module';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SelectableProjectWithLanguageCode } from '../core/paratext.service';
import { projectLabel } from '../shared/utils';
import { ProjectSelectComponent } from './project-select.component';

const meta: Meta<ProjectSelectComponent> = {
  title: 'Utility/ProjectSelect',
  component: ProjectSelectComponent,
  decorators: [
    moduleMetadata({
      imports: [I18nStoryModule, TranslocoModule, UICommonModule]
    })
  ]
};

export default meta;
type Story = StoryObj<ProjectSelectComponent>;

const languageCodes = ['en', 'fr', 'es', 'pt', 'de', 'ru', 'zh', 'ar', 'hi', 'bn'];

function languageName(code: string): string {
  return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code;
}

function getTestProjects(count: number, type: 'Project' | 'Resource'): SelectableProjectWithLanguageCode[] {
  return new Array(count).fill(0).map((_, i) => {
    const languageCode = languageCodes[i % languageCodes.length];
    const n = Math.floor(i / languageCodes.length) + 1;
    return {
      paratextId: `${type.toLowerCase()}-${i}`,
      name: `${languageName(languageCode)} ${type} ${n}`,
      shortName: `${type.charAt(0)}_${languageCode.toUpperCase()}_${n}`,
      languageTag: languageCode
    };
  });
}

export const Blank: Story = {};

export const Placeholder: Story = {
  args: { placeholder: 'Select a project or resource' }
};

export const ProjectsOnly: Story = {
  args: {
    placeholder: 'Select a project or resource',
    projects: getTestProjects(5, 'Project')
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const combobox = await canvas.findByRole('combobox');
    await combobox.click();
  }
};

export const ResourcesOnly: Story = {
  args: {
    placeholder: 'Select a project or resource',
    resources: getTestProjects(5, 'Resource')
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const combobox = await canvas.findByRole('combobox');
    await combobox.click();
  }
};

export const ProjectsAndResources: Story = {
  args: {
    placeholder: 'Select a project or resource',
    projects: getTestProjects(1, 'Project'),
    resources: getTestProjects(5, 'Resource')
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const combobox = await canvas.findByRole('combobox');
    await combobox.click();
  }
};

export const Disabled: Story = {
  args: {
    placeholder: 'Select a project or resource',
    projects: getTestProjects(5, 'Project'),
    isDisabled: true,
    value: getTestProjects(5, 'Project')[2].paratextId
  }
};

export const CurrentValueNotInList: Story = {
  args: {
    placeholder: 'Select a project or resource',
    projects: getTestProjects(5, 'Project'),
    resources: getTestProjects(5, 'Resource'),
    // Include a project that is not in the list of projects that is available to select
    nonSelectableProjects: getTestProjects(6, 'Project').slice(5),
    value: getTestProjects(6, 'Project').slice(5)[0].paratextId
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const combobox = canvas.getByRole('combobox');
    await userEvent.click(combobox);
    const projectLabels = getTestProjects(6, 'Project').map(projectLabel);
    for (let i = 0; i < projectLabels.length; i++) {
      const option = canvas.queryByRole('option', { name: projectLabels[i] });
      if (i < 5) expect(option).not.toBeNull();
      else expect(option).toBeNull();
    }
  }
};

export const SomeProjectsHidden: Story = {
  args: {
    placeholder: 'Select a project or resource',
    projects: getTestProjects(5, 'Project'),
    resources: getTestProjects(5, 'Resource'),
    hiddenParatextIds: [getTestProjects(5, 'Project')[2].paratextId, getTestProjects(5, 'Resource')[2].paratextId]
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const combobox = await canvas.findByRole('combobox');
    await combobox.click();
    const projectLabels = getTestProjects(5, 'Project').concat(getTestProjects(5, 'Resource')).map(projectLabel);
    for (let i = 0; i < projectLabels.length; i++) {
      const option = canvas.queryByRole('option', { name: projectLabels[i] });
      if (i === 2 || i === 7) expect(option).toBeNull();
      else expect(option).not.toBeNull();
    }
  }
};
