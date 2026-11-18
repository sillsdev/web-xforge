import { Meta, StoryObj } from '@storybook/angular';
import { BehaviorSubject } from 'rxjs';
import { expect, waitFor, within } from 'storybook/test';
import { anything, instance, mock, reset, when } from 'ts-mockito';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { BookProgress, ProgressService, ProjectProgress } from '../progress-service/progress.service';
import { Book } from './book-multi-select';
import { BookMultiSelectComponent } from './book-multi-select.component';

const mockedProgressService = mock(ProgressService);
const mockedOnlineStatusService = mock(OnlineStatusService);

// A spread across all three sections: OT (Genesis, Exodus, Leviticus), NT (Matthew, Luke), DC (Tobit, Wisdom).
const AVAILABLE_BOOK_NUMBERS = [1, 2, 3, 40, 42, 67, 70];

/** Creates a BookProgress with exactly 1 chapter, that reports the specified amount of progress */
function completeBook(bookId: string, counts: { verses: number; blankVerses: number }): BookProgress {
  const { verses, blankVerses } = counts;
  return {
    bookId,
    verses,
    blankVerses,
    expectedVerses: verses,
    chapters: [{ chapterNumber: 1, verses, blankVerses, expectedVerses: verses }]
  };
}

// Varied progress so the bars render at a range of widths, including 0% and 100%.
const PROGRESS: BookProgress[] = [
  completeBook('GEN', { verses: 0, blankVerses: 0 }), // no data → 0%
  completeBook('EXO', { verses: 10_000, blankVerses: 8_500 }), // 15%
  completeBook('LEV', { verses: 10_000, blankVerses: 7_000 }), // 30%
  completeBook('MAT', { verses: 10_000, blankVerses: 5_500 }), // 45%
  completeBook('LUK', { verses: 10_000, blankVerses: 4_000 }), // 60%
  completeBook('TOB', { verses: 10_000, blankVerses: 2_000 }), // 80%
  completeBook('WIS', { verses: 10_000, blankVerses: 0 }) // 100%
];

interface StoryArgs {
  availableBooks: number[];
  selectedBooks: number[];
  showProgress: boolean;
  bulkBookSelection: boolean;
  readonly: boolean;
  projectName?: string;
  online: boolean;
}

function toBooks(numbers: number[]): Book[] {
  return numbers.map(number => ({ number, selected: false }));
}

const meta: Meta<StoryArgs> = {
  title: 'Shared/Book Multi-Select',
  component: BookMultiSelectComponent,
  args: {
    availableBooks: AVAILABLE_BOOK_NUMBERS,
    selectedBooks: [1, 3],
    showProgress: true,
    bulkBookSelection: true,
    readonly: false,
    online: true
  },
  render: args => {
    reset(mockedProgressService);
    reset(mockedOnlineStatusService);
    when(mockedProgressService.getProgress(anything(), anything())).thenResolve(new ProjectProgress(PROGRESS));
    when(mockedOnlineStatusService.onlineStatus$).thenReturn(new BehaviorSubject<boolean>(args.online).asObservable());
    return {
      props: {
        availableBooks: toBooks(args.availableBooks),
        selectedBooks: toBooks(args.selectedBooks),
        showProgress: args.showProgress,
        bulkBookSelection: args.bulkBookSelection,
        readonly: args.readonly,
        projectName: args.projectName,
        projectId: 'project01'
      },
      moduleMetadata: {
        imports: [BookMultiSelectComponent],
        providers: [
          { provide: ProgressService, useValue: instance(mockedProgressService) },
          { provide: OnlineStatusService, useValue: instance(mockedOnlineStatusService) }
        ]
      }
    };
  }
};

export default meta;

type Story = StoryObj<StoryArgs>;

/** Progress bars plus the OT/NT/DC select-all checkboxes (the "full" usage, e.g. the training-books step). */
export const FullFeatured: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText('Genesis');
    expect(canvasElement.querySelector('.scope-selection')).not.toBeNull();
    // Progress bars appear once the (online) fetch resolves.
    await waitFor(() => expect(canvasElement.querySelector('.border-fill')).not.toBeNull());
  }
};

/** Just selectable book chips — no progress, no testament checkboxes (the default for both flags). */
export const Basic: Story = {
  args: { showProgress: false, bulkBookSelection: false },
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText('Genesis');
    expect(canvasElement.querySelector('.scope-selection')).toBeNull();
    expect(canvasElement.querySelector('.border-fill')).toBeNull();
  }
};

/** A project name is shown above the books. */
export const WithProjectName: Story = {
  args: { projectName: 'Greek NT' },
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText('Greek NT');
  }
};

/** Read-only: chips aren't selectable and the testament checkboxes are hidden. */
export const ReadOnly: Story = {
  args: { readonly: true },
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText('Genesis');
    expect(canvasElement.querySelector('.scope-selection')).toBeNull();
  }
};

/**
 * Offline with progress enabled: the book list still renders (so books stay selectable), but no progress is fetched
 * or shown. When the connection returns, progress is fetched and the bars appear.
 */
export const Offline: Story = {
  args: { online: false },
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText('Genesis');
    expect(canvasElement.querySelector('.border-fill')).toBeNull();
  }
};
