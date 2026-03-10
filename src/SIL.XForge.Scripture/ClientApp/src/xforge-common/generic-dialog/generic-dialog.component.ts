import { CdkScrollable } from '@angular/cdk/scrolling';
import { AsyncPipe } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle
} from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { Observable } from 'rxjs';

export interface GenericDialogOptions<T> {
  title?: Observable<string>;
  message?: Observable<string>;
  options: {
    label: Observable<string>;
    value: T;
    highlight?: boolean;
    icon?: string;
  }[];
}

/**
 * An object that contains a reference to the dialog and a promise that resolves to the result of the dialog.
 */
export interface GenericDialogRef<T> {
  dialogRef: MatDialogRef<GenericDialogComponent<T>, T>;
  result: Promise<T | undefined>;
}

@Component({
  selector: 'app-generic-dialog',
  templateUrl: './generic-dialog.component.html',
  imports: [
    MatDialogTitle,
    CdkScrollable,
    MatDialogContent,
    MatDialogActions,
    MatButton,
    MatDialogClose,
    AsyncPipe,
    MatIcon
  ]
})
export class GenericDialogComponent<T> {
  constructor(@Inject(MAT_DIALOG_DATA) private readonly data: GenericDialogOptions<T>) {}

  get title$(): Observable<string> | undefined {
    return this.data.title;
  }

  get message$(): Observable<string> | undefined {
    return this.data.message;
  }

  get options(): GenericDialogOptions<T>['options'] {
    return this.data.options;
  }
}
