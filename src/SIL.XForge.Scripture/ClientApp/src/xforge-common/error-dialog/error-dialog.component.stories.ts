import { Component, Inject, InjectionToken, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { Meta, StoryFn } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { I18nStoryModule } from 'xforge-common/i18n-story.module';
import { UICommonModule } from '../ui-common.module';
import { ErrorDialogComponent, ErrorAlertData } from './error-dialog.component';

interface StoryArgs {
  browserUnsupported: true;
  dialogData: ErrorAlertData;
}
const STORY_ARGS = new InjectionToken<StoryArgs>('storybook args');

@Component({ template: '' })
export class MatDialogLaunchComponent implements OnInit {
  constructor(
    private dialog: MatDialog,
    @Inject(MAT_DIALOG_DATA) public data: MatDialogConfig<ErrorAlertData>,
    @Inject(STORY_ARGS) public storyArgs: StoryArgs
  ) {}

  public ngOnInit(): void {
    const dialogRef = this.dialog.open(ErrorDialogComponent, this.data);
    dialogRef.componentInstance.browserUnsupported = this.storyArgs.browserUnsupported;
  }
}

export default {
  title: 'Error Dialog',
  component: MatDialogLaunchComponent
} as Meta;

const Template: StoryFn = args => ({
  moduleMetadata: {
    imports: [UICommonModule, CommonModule, I18nStoryModule],
    declarations: [ErrorDialogComponent],
    providers: [
      { provide: MAT_DIALOG_DATA, useValue: { data: args.dialogData } },
      { provide: STORY_ARGS, useValue: args }
    ]
  },
  props: args
});

const defaultArgs = {
  browserUnsupported: false,
  dialogData: {
    message: 'The error message',
    stack: 'Error Stack line 1\nError Stack line 2\nError Stack line 3',
    eventId: '12345'
  }
};

export const Default = Template.bind({});
Default.args = defaultArgs;

export const WithUnsupportedBrowser = Template.bind({});
WithUnsupportedBrowser.args = {
  ...defaultArgs,
  browserUnsupported: true
};
