import { Meta } from '@storybook/angular';
import {
  BrowserIssue,
  SupportedBrowsersDialogComponent
} from 'xforge-common/supported-browsers-dialog/supported-browsers-dialog.component';
import { ErrorAlert, ErrorComponent } from 'xforge-common/error/error.component';
import {
  ImportQuestionsConfirmationDialogComponent,
  ImportQuestionsConfirmationDialogData
} from './app/checking/import-questions-dialog/import-questions-confirmation-dialog/import-question-confirmation-dialog.component';
import { QuestionAnsweredDialogComponent } from './app/checking/question-answered-dialog/question-answered-dialog.component';
import { ProjectDeletedDialogComponent } from './app/project-deleted-dialog/project-deleted-dialog.component';
import { DeleteProjectDialogComponent } from './app/settings/delete-project-dialog/delete-project-dialog.component';
import { MdcDialogLaunchComponent, mdcDialogStory } from '.storybook/story-utils';

// This set of stories is for dialogs that are being converted from MDC to Angular Material.
// Typically each dialog, being a separate component, should have its own set of stories.
// However, in order to quickly get as many MDC dialogs into Storybook as possible, nearly all the MDC dialogs were put
// in this file. When converting a dialog to Material it would be preferable to update this file to show the new dialog
// component, so that Chromatic can compare the old and new versions of the dialog.

const meta: Meta = {
  title: 'Dialogs',
  component: MdcDialogLaunchComponent
};
export default meta;

export const QuestionAnswered = mdcDialogStory(QuestionAnsweredDialogComponent);

export const ProjectDeletedDialog = mdcDialogStory(ProjectDeletedDialogComponent);

export const DeleteProjectDialog = mdcDialogStory(DeleteProjectDialogComponent);
DeleteProjectDialog.args = { data: { name: 'My Project' } };

export const UnsupportedBrowser = mdcDialogStory(SupportedBrowsersDialogComponent);
UnsupportedBrowser.args = { data: BrowserIssue.Upgrade };

export const UnsupportedBrowserAudioRecording = mdcDialogStory(SupportedBrowsersDialogComponent);
UnsupportedBrowserAudioRecording.args = { data: BrowserIssue.AudioRecording };

export const ImportQuestionsConfirmation = mdcDialogStory(ImportQuestionsConfirmationDialogComponent);
const confirmationData: ImportQuestionsConfirmationDialogData = {
  questions: [
    { before: 'Question before', after: 'Question after', answerCount: 2, checked: true },
    { before: 'Second question', after: 'Second question (edited)', answerCount: 1, checked: true }
  ]
};
ImportQuestionsConfirmation.args = { data: confirmationData };

export const ErrorDialog = mdcDialogStory(ErrorComponent);
const errorData: ErrorAlert = {
  message: 'This is an error message',
  stack: 'This is an error stack',
  eventId: '12345'
};
ErrorDialog.args = { data: errorData };
