import { CommonModule } from '@angular/common';
import { Meta, StoryFn } from '@storybook/angular';
import { expect } from '@storybook/test';
import { userEvent, within } from '@storybook/test';
import { I18nStoryModule } from 'xforge-common/i18n-story.module';
import { arrayOfIntsFromOne } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { BookChapterChooserComponent } from './book-chapter-chooser.component';
import { getOverlay } from '../../../../.storybook/util/mat-dialog-launch';

const CANON_SIZE = 66; // all books we currently localize

const meta: Meta = {
  title: 'Shared/Book & Chapter Chooser',
  component: BookChapterChooserComponent,
  argTypes: {
    book: {
      options: arrayOfIntsFromOne(CANON_SIZE),
      control: 'select'
    }
  }
};
export default meta;

const Template: StoryFn = args => ({
  moduleMetadata: { imports: [CommonModule, UICommonModule, I18nStoryModule] },
  props: args
});

const defaultArgs = {
  books: arrayOfIntsFromOne(CANON_SIZE),
  book: 1,
  chapters: arrayOfIntsFromOne(50),
  chapter: 1
};

export const Genesis = Template.bind({});
Genesis.args = {
  ...defaultArgs
};

export const Ruth = Template.bind({});
Ruth.args = {
  ...defaultArgs,
  book: 8,
  chapters: arrayOfIntsFromOne(4)
};

export const ClickToLastChapter = Template.bind({});
ClickToLastChapter.args = {
  ...Ruth.args
};
ClickToLastChapter.play = async ({ canvasElement, args }) => {
  const canvas = within(canvasElement);
  const nextButton = await canvas.findByTitle('Next chapter');
  const prevButton = await canvas.findByTitle('Previous chapter');
  expect(prevButton).toBeDisabled();
  for (const _chapter of args.chapters.slice(1)) {
    expect(nextButton).not.toBeDisabled();
    await userEvent.click(nextButton);
    expect(prevButton).not.toBeDisabled();
  }
  expect(nextButton).toBeDisabled();
};

export const ChaptersInOrder = Template.bind({});
ChaptersInOrder.args = {
  books: [2, 1],
  book: 1,
  chapters: arrayOfIntsFromOne(50),
  chapter: 1
};
ChaptersInOrder.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const [bookSelect, _chapterSelect] = await canvas.findAllByRole('combobox');
  await userEvent.click(bookSelect);
  const overlay = within(getOverlay(canvasElement));
  const menu = await overlay.findByRole('listbox');
  const options = await within(menu).findAllByRole('option');
  expect(options).toHaveLength(2);
  expect(options[0]).toHaveTextContent('Genesis');
  expect(options[1]).toHaveTextContent('Exodus');
};

export const Mobile = Template.bind({});
Mobile.args = { ...defaultArgs };
Mobile.parameters = {
  viewport: { defaultViewport: 'mobile1' }
};

export const SelectBook = Template.bind({});
SelectBook.args = { ...defaultArgs };
SelectBook.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const [bookSelect, _chapterSelect] = await canvas.findAllByRole('combobox');
  await userEvent.click(bookSelect);
  const overlay = within(getOverlay(canvasElement));
  const menu = await overlay.findByRole('listbox');
  const book2 = await within(menu).findByText('Exodus');
  await userEvent.click(book2);
};

export const SelectChapter = Template.bind({});
SelectChapter.args = { ...defaultArgs };
SelectChapter.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const [_bookSelect, chapterSelect] = await canvas.findAllByRole('combobox');
  await userEvent.click(chapterSelect);
  const overlay = within(getOverlay(canvasElement));
  const menu = await overlay.findByRole('listbox');
  const chapter2 = await within(menu).findByText('2');
  await userEvent.click(chapter2);
};

export const Arabic = Template.bind({});
Arabic.args = { ...defaultArgs };
Arabic.parameters = { locale: 'ar' };
