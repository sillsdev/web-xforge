import { userEvent, within } from '@storybook/testing-library';
import { CommonModule } from '@angular/common';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { Meta, Story } from '@storybook/angular';
import { Canon } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/canon';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { expect } from '@storybook/jest';
import { arrayOfIntsFromOne } from 'xforge-common/test-utils';
import { getOverlay } from '../../../../.storybook/story-utils';
import { BookChapterChooserComponent } from './book-chapter-chooser.component';

export default {
  title: 'Shared/Book & Chapter Chooser',
  component: BookChapterChooserComponent,
  argTypes: {
    book: {
      options: arrayOfIntsFromOne(Canon.allBookIds.length),
      control: 'select'
    },
    chapter: { control: 'select', options: arrayOfIntsFromOne(10) },
    chapters: { control: 'array' }
  }
} as Meta<BookChapterChooserComponent>;

const Template: Story = args => ({
  moduleMetadata: {
    imports: [CommonModule, UICommonModule, BrowserAnimationsModule]
  },
  props: args
});

const defaultArgs = {
  books: arrayOfIntsFromOne(66),
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
    userEvent.click(nextButton);
    expect(prevButton).not.toBeDisabled();
  }
  expect(nextButton).toBeDisabled();
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
  userEvent.click(bookSelect);
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
  userEvent.click(chapterSelect);
  const overlay = within(getOverlay(canvasElement));
  const menu = await overlay.findByRole('listbox');
  const chapter2 = await within(menu).findByText('2');
  userEvent.click(chapter2);
};
