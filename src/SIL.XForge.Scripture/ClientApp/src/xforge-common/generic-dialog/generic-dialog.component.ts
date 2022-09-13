import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
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

@Component({
  selector: 'app-generic-dialog',
  templateUrl: './generic-dialog.component.html'
})
export class GenericDialogComponent<T> {
  constructor(@Inject(MAT_DIALOG_DATA) private readonly data: GenericDialogOptions<T>) {}

  get title() {
    return this.data.title;
  }

  get message() {
    return this.data.message;
  }

  get options() {
    return this.data.options;
  }
}
