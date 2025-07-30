import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
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
  templateUrl: './generic-dialog.component.html',
  standalone: false
})
export class GenericDialogComponent<T> {
  constructor(@Inject(MAT_DIALOG_DATA) private readonly data: GenericDialogOptions<T>) {}

  get title$(): Observable<string> | undefined {
    return this.data.title;
  }

  get message$(): Observable<string> | undefined {
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
