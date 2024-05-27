import { CommonModule } from '@angular/common';
import { Component, Inject, InjectionToken, OnInit, Provider } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { TranslocoModule } from '@ngneat/transloco';
import { StoryFn } from '@storybook/angular';
import { UICommonModule } from 'xforge-common/ui-common.module';

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

@Component({ template: '' })
export class MatDialogLaunchComponent implements OnInit {
  constructor(
    private dialog: MatDialog,
    @Inject(MAT_DIALOG_DATA) public data: any,
    @Inject(COMPONENT_UNDER_TEST) private component: any
  ) {}

  public ngOnInit(): void {
    this.dialog.open(this.component, this.data);
  }
}

export function matDialogStory(
  component: any,
  imports: any[] = [],
  declarations: any[] = [],
  providers: Provider[] = []
): StoryFn {
  return getDialogStory(imports, component, declarations, providers, MAT_DIALOG_DATA);
}

function getDialogStory(
  imports: any[],
  component: any,
  declarations: any[],
  providers: Provider[],
  dialogData: InjectionToken<any>
) {
  const story: StoryFn = args => ({
    moduleMetadata: {
      imports: [UICommonModule, CommonModule, TranslocoModule, ...imports],
      declarations: [component, ...declarations],
      providers: [
        { provide: dialogData, useValue: { data: args.data } },
        { provide: COMPONENT_UNDER_TEST, useValue: component },
        ...providers
      ]
    },
    props: args
  });
  return story;
}
