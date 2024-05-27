import { CommonModule } from '@angular/common';
import { Component, Inject, InjectionToken, OnInit, Provider } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { StoryFn } from '@storybook/angular';
import { hasProp } from '../../src/type-utils';
import { UICommonModule } from '../../src/xforge-common/ui-common.module';

export const COMPONENT_UNDER_TEST = new InjectionToken<any>('COMPONENT_UNDER_TEST');
export const COMPONENT_PROPS = new InjectionToken<any>('COMPONENT_PROPS');

interface MatDialogStoryConfig {
  imports?: any[];
  declarations?: any[];
  providers?: Provider[];
}

@Component({ template: '' })
export class MatDialogLaunchComponent implements OnInit {
  constructor(
    private dialog: MatDialog,
    @Inject(MAT_DIALOG_DATA) public data: any,
    @Inject(COMPONENT_UNDER_TEST) private component: any,
    @Inject(COMPONENT_PROPS) private props: any
  ) {}

  public ngOnInit(): void {
    const dialogRef = this.dialog.open(this.component, this.data);
    const componentInstance = dialogRef.componentInstance;

    // Set component props if supplied
    for (let key in this.props) {
      if (hasProp(componentInstance, key)) {
        componentInstance[key] = this.props[key];
      }
    }
  }
}

export function matDialogStory(component: any, config?: MatDialogStoryConfig): StoryFn {
  const story: StoryFn = args => ({
    moduleMetadata: {
      imports: [UICommonModule, CommonModule, ...(config?.imports ?? [])],
      declarations: [component, ...(config?.declarations ?? [])],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { data: args.data } },
        { provide: COMPONENT_UNDER_TEST, useValue: component },
        { provide: COMPONENT_PROPS, useValue: args },
        ...(config?.providers ?? [])
      ]
    },
    props: args
  });
  return story;
}
