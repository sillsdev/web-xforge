import { CommonModule } from '@angular/common';
import { Component, Inject, InjectionToken, Injector, OnInit, Provider } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { TranslocoModule } from '@ngneat/transloco';
import { StoryFn } from '@storybook/angular';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { hasProp } from '../../src/type-utils';

export function getOverlays(element: HTMLElement): HTMLElement[] {
  return Array.from(element.ownerDocument.querySelectorAll('.cdk-overlay-container .cdk-overlay-pane'));
}

export function getOverlay(element: HTMLElement): HTMLElement {
  const overlays = getOverlays(element);
  if (overlays.length !== 1) {
    throw new Error(`Expected 1 overlay, found ${overlays.length}`);
  }
  return overlays[0];
}

export const COMPONENT_UNDER_TEST = new InjectionToken<any>('COMPONENT_UNDER_TEST');
export const COMPONENT_PROPS = new InjectionToken<any>('COMPONENT_PROPS');

export interface MatDialogStoryConfig {
  imports?: any[];
  declarations?: any[];
  providers?: Provider[];
  standaloneComponent?: boolean;
}

@Component({ template: '' })
export class MatDialogLaunchComponent implements OnInit {
  constructor(
    private dialog: MatDialog,
    @Inject(MAT_DIALOG_DATA) public data: any,
    @Inject(COMPONENT_UNDER_TEST) private component: any,
    @Inject(COMPONENT_PROPS) private props: any,
    private injector: Injector
  ) {}

  public ngOnInit(): void {
    const dialogRef = this.dialog.open(this.component, {
      data: this.data,
      injector: Injector.create({ providers: [], parent: this.injector })
    });
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
      imports: [UICommonModule, CommonModule, TranslocoModule, ...(config?.imports ?? [])],
      declarations: [...(config?.standaloneComponent ? [] : [component]), ...(config?.declarations ?? [])],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: args.data },
        { provide: COMPONENT_UNDER_TEST, useValue: component },
        { provide: COMPONENT_PROPS, useValue: args },
        ...(config?.providers ?? [])
      ]
    },
    props: args
  });
  return story;
}
