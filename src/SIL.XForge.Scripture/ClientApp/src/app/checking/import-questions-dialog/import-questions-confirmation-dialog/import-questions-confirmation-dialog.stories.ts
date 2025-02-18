import { Meta } from '@storybook/angular';
import { MatDialogLaunchComponent, matDialogStory } from '../../../../../.storybook/util/mat-dialog-launch';
import {
  ImportQuestionsConfirmationDialogComponent,
  ImportQuestionsConfirmationDialogData
} from './import-questions-confirmation-dialog.component';

const meta: Meta = {
  title: 'Import/Import Questions',
  component: MatDialogLaunchComponent
};
export default meta;

export const ImportQuestionsConfirmation = matDialogStory(ImportQuestionsConfirmationDialogComponent);
const confirmationData: ImportQuestionsConfirmationDialogData = {
  questions: [
    {
      before: 'Question before',
      after: 'Question after',
      answerCount: 2,
      checked: true
    },
    {
      before: 'Second question',
      after: 'Second question (edited)',
      answerCount: 1,
      checked: false
    },
    {
      before: 'Third question',
      after: 'A much better wording of the question',
      answerCount: 1,
      checked: true
    },
    {
      before: 'Question #4',
      after: 'Fourth question (edited)',
      answerCount: 1,
      checked: true
    }
  ]
};
ImportQuestionsConfirmation.args = { data: confirmationData };
