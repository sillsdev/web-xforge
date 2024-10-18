import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { expect, within } from '@storybook/test';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { instance, mock, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { RESOURCE_IDENTIFIER_LENGTH } from '../../core/paratext.service';
import { FontUnsupportedMessageComponent } from './font-unsupported-message.component';

const mockedActivatedProjectService = mock(ActivatedProjectService);

interface FontUnsupportedMessageStoryState {
  fontName: string;
  isResource: boolean;
}

const defaultArgs: FontUnsupportedMessageStoryState = {
  fontName: 'Arial',
  isResource: false
};

export default {
  title: 'Translate/Font Unsupported Message',
  component: FontUnsupportedMessageComponent,
  decorators: [
    (story, context) => {
      when(mockedActivatedProjectService.projectDoc).thenReturn({
        data: createTestProjectProfile({
          defaultFont: context.args['fontName'],
          paratextId: new Array(context.args['isResource'] ? RESOURCE_IDENTIFIER_LENGTH : 40).fill('a').join('')
        })
      } as SFProjectProfileDoc);

      return story;
    },
    moduleMetadata({
      imports: [],
      providers: [
        {
          provide: ActivatedProjectService,
          useValue: instance(mockedActivatedProjectService)
        }
      ]
    })
  ],
  args: defaultArgs
} as Meta<FontUnsupportedMessageStoryState>;

type Story = StoryObj<FontUnsupportedMessageStoryState>;

export const ProjectWithUnsupportedFont: Story = {
  args: {
    fontName: 'Arial',
    isResource: false
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText(/select a different font/i)).toBeInTheDocument();
    expect(canvas.queryByText(/will only work in Firefox/i)).toBeNull();
    expect((canvas.getByRole('link', { name: /contact us/i }) as HTMLAnchorElement).href).toMatch(/mailto:help@/);
  }
};

export const ProjectWithGraphiteFont: Story = {
  args: {
    fontName: 'Awami Nastaliq',
    isResource: false
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText(/select a different font/i)).toBeInTheDocument();
    expect(canvas.getByText(/will only work in Firefox/i)).toBeInTheDocument();
    expect((canvas.getByRole('link', { name: /contact us/i }) as HTMLAnchorElement).href).toMatch(/mailto:help@/);
    expect(canvas.getByRole('link', { name: /Graphite/i })).toHaveAttribute('href', 'https://graphite.sil.org/');
  }
};

export const ResourceWithUnsupportedFont: Story = {
  args: {
    fontName: 'Times New Roman',
    isResource: true
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.queryByText(/select a different font/i)).toBeNull();
    expect(canvas.queryByText(/will only work in Firefox/i)).toBeNull();
    expect((canvas.getByRole('link', { name: /contact us/i }) as HTMLAnchorElement).href).toMatch(/mailto:help@/);
  }
};

export const ResourceWithGraphiteFont: Story = {
  args: {
    fontName: 'Awami Nastaliq',
    isResource: true
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.queryByText(/select a different font/i)).toBeNull();
    expect(canvas.getByText(/will only work in Firefox/i)).toBeInTheDocument();
    expect((canvas.getByRole('link', { name: /contact us/i }) as HTMLAnchorElement).href).toMatch(/mailto:help@/);
    expect(canvas.getByRole('link', { name: /Graphite/i })).toHaveAttribute('href', 'https://graphite.sil.org/');
  }
};
