import { Meta, StoryObj } from '@storybook/angular';
import { keyBy, mapValues } from 'lodash-es';
import { arrayOfIntsFromOne } from 'xforge-common/test-utils';
import { BookChapterCombinedChooserComponent } from './book-chapter-combined-chooser.component';

const CANON_SIZE = 66;

export default {
  title: 'Shared/Book & Chapter Combined Chooser',
  component: BookChapterCombinedChooserComponent,
  args: {
    books: arrayOfIntsFromOne(CANON_SIZE),
    book: 1,
    chapters: mapValues(keyBy(arrayOfIntsFromOne(CANON_SIZE)), () => arrayOfIntsFromOne(50)),
    chapter: 1
  }
} as Meta;

type Story = StoryObj<BookChapterCombinedChooserComponent>;

export const Default: Story = {};
