import { CommonModule } from '@angular/common';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { expect, userEvent, waitFor, within } from '@storybook/test';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { of } from 'rxjs';
import { anything, instance, mock, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { LocationService } from 'xforge-common/location.service';
import { NoticeService } from 'xforge-common/notice.service';
import { UICommonModule } from '../../../xforge-common/ui-common.module';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { CreateSourcesLinkComponent } from './create-sources-link.component';

const mockActivatedProjectService = mock(ActivatedProjectService);
const mockLocationService = mock(LocationService);
const mockNoticeService = mock(NoticeService);

const defaultProjectDoc = {
  id: 'test-project-id',
  data: createTestProjectProfile()
} as SFProjectProfileDoc;

// Set up default mocks
when(mockActivatedProjectService.projectId).thenReturn('test-project-id');
when(mockActivatedProjectService.changes$).thenReturn(of(defaultProjectDoc));
when(mockActivatedProjectService.projectDoc).thenReturn(defaultProjectDoc);
when(mockLocationService.origin).thenReturn('https://scriptureforge.org');
when(mockNoticeService.show(anything())).thenResolve();
when(mockNoticeService.showError(anything())).thenResolve();

interface CreateSourcesLinkComponentStoryState {
  initialTrainingSources: string;
  initialDraftingSources: string;
}

const defaultArgs: CreateSourcesLinkComponentStoryState = {
  initialTrainingSources: '',
  initialDraftingSources: ''
};

const meta: Meta<CreateSourcesLinkComponentStoryState> = {
  title: 'Serval Administration/Create Sources Link',
  component: CreateSourcesLinkComponent,
  decorators: [
    moduleMetadata({
      imports: [CommonModule, MatSnackBarModule, UICommonModule],
      providers: [
        { provide: ActivatedProjectService, useValue: instance(mockActivatedProjectService) },
        { provide: LocationService, useValue: instance(mockLocationService) },
        { provide: NoticeService, useValue: instance(mockNoticeService) }
      ]
    })
  ],
  args: defaultArgs,
  argTypes: {
    initialTrainingSources: {
      control: 'text',
      description: 'Initial value for training sources input'
    },
    initialDraftingSources: {
      control: 'text',
      description: 'Initial value for drafting sources input'
    }
  }
};

export default meta;

type Story = StoryObj<CreateSourcesLinkComponentStoryState>;

// Template story that contains common render logic
const Template: Story = {
  render: args => {
    return {
      props: args,
      template: `
        <div style="max-width: 1400px; margin: 20px;">
          <app-create-sources-link></app-create-sources-link>
        </div>
      `
    };
  }
};

export const Default: Story = {
  ...Template,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Verify the component renders with correct elements
    const cardTitle = await canvas.findByText('Create Draft Sources Configuration Link');
    expect(cardTitle).toBeInTheDocument();

    const trainingSourcesInput = await canvas.findByLabelText('Training Sources');
    expect(trainingSourcesInput).toBeInTheDocument();

    const draftingSourcesInput = await canvas.findByLabelText('Draft Source');
    expect(draftingSourcesInput).toBeInTheDocument();

    // Verify placeholder text
    expect(trainingSourcesInput).toHaveAttribute('placeholder', 'Enter training project short names (comma-separated)');
    expect(draftingSourcesInput).toHaveAttribute('placeholder', 'Enter source short name');

    // Initially no link should be present
    const linkInputs = canvas.queryAllByDisplayValue(/https:/);
    expect(linkInputs).toHaveLength(0);
  }
};

export const WithInitialValues: Story = {
  ...Template,
  args: {
    ...defaultArgs,
    initialTrainingSources: 'project1, project2',
    initialDraftingSources: 'draft-source'
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    // Find the form inputs
    const trainingSourcesInput = await canvas.findByLabelText('Training Sources');
    const draftingSourcesInput = await canvas.findByLabelText('Draft Source');

    // Fill in the training sources
    await userEvent.clear(trainingSourcesInput);
    await userEvent.type(trainingSourcesInput, args.initialTrainingSources);

    // Fill in the drafting source
    await userEvent.clear(draftingSourcesInput);
    await userEvent.type(draftingSourcesInput, args.initialDraftingSources);

    // Wait for the link to be generated
    await waitFor(async () => {
      const expectedPattern =
        /https:\/\/scriptureforge\.org.*trainingSources=project1%2Cproject2.*draftingSources=draft-source/;
      const linkField = await canvas.findByDisplayValue(expectedPattern);
      expect(linkField).toBeInTheDocument();
    });

    // Verify the copy button is present
    const copyButton = await canvas.findByText('content_copy');
    expect(copyButton).toBeInTheDocument();
  }
};

export const InvalidProjectNames: Story = {
  ...Template,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Find the form inputs
    const trainingSourcesInput = await canvas.findByLabelText('Training Sources');
    const draftingSourcesInput = await canvas.findByLabelText('Draft Source');

    // Enter invalid project names (remove the HTML entity since we're typing directly)
    await userEvent.type(trainingSourcesInput, 'valid-project, invalid project!');
    await userEvent.type(draftingSourcesInput, 'another invalid@name');

    // Wait for error message to appear
    await waitFor(async () => {
      const errorMessage = await canvas.findByText(/Invalid project short names:/);
      expect(errorMessage).toBeInTheDocument();
    });
  }
};

export const TooManyTrainingSources: Story = {
  ...Template,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Find the form inputs
    const trainingSourcesInput = await canvas.findByLabelText('Training Sources');
    const draftingSourcesInput = await canvas.findByLabelText('Draft Source');

    // Enter too many training sources (max is 2)
    await userEvent.type(trainingSourcesInput, 'project1, project2, project3');
    await userEvent.type(draftingSourcesInput, 'draft-source');

    // Wait for error message to appear
    await waitFor(async () => {
      const errorMessage = await canvas.findByText(/You can specify a maximum of 2 training sources/);
      expect(errorMessage).toBeInTheDocument();
    });
  }
};

export const MultipleDraftingSources: Story = {
  ...Template,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Find the form inputs
    const trainingSourcesInput = await canvas.findByLabelText('Training Sources');
    const draftingSourcesInput = await canvas.findByLabelText('Draft Source');

    // Enter multiple drafting sources (max is 1)
    await userEvent.type(trainingSourcesInput, 'project1');
    await userEvent.type(draftingSourcesInput, 'draft-source1, draft-source2');

    // Wait for error message to appear
    await waitFor(async () => {
      const errorMessage = await canvas.findByText(/You can specify only 1 drafting source/);
      expect(errorMessage).toBeInTheDocument();
    });
  }
};
