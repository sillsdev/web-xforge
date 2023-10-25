import { Component, Inject } from '@angular/core';
import {
  MatLegacyDialogRef as MatDialogRef,
  MAT_LEGACY_DIALOG_DATA as MAT_DIALOG_DATA
} from '@angular/material/legacy-dialog';
import { Observable } from 'rxjs';

export interface GenericDialogOptions<T> {
  title?: Observable<string>;
  message?: Observable<string>;
  options: {
    label: Observable<string>;
    value: T;
    highlight?: boolean;
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
  templateUrl: './generic-dialog.component.html'
})
export class GenericDialogComponent<T> {
  constructor(@Inject(MAT_DIALOG_DATA) private readonly data: GenericDialogOptions<T>) {}

  get title(): Observable<string> | undefined {
    return this.data.title;
  }

  get message(): Observable<string> | undefined {
    return this.data.message;
  }

  get options(): {
    label: Observable<string>;
    value: T;
    highlight?: boolean | undefined;
  }[] {
    return this.data.options;
  }
}
