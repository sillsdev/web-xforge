import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Notification } from 'realtime-server/lib/esm/common/models/notification';
import { objectId } from '../utils';

/**
 * Dialog for creating system notifications
 */
@Component({
  selector: 'app-sa-notifications-dialog',
  template: `
    <h2 mat-dialog-title>Create Notification</h2>
    <form [formGroup]="notificationForm" (ngSubmit)="submit()">
      <mat-dialog-content>
        <mat-form-field>
          <mat-label>Title</mat-label>
          <input matInput formControlName="title" required />
        </mat-form-field>

        <mat-form-field>
          <mat-label>Content</mat-label>
          <textarea matInput formControlName="content" required rows="4"></textarea>
        </mat-form-field>

        <mat-form-field>
          <mat-label>Type</mat-label>
          <mat-select formControlName="type" required>
            <mat-option value="Obtrusive">Obtrusive</mat-option>
            <mat-option value="Unobtrusive">Unobtrusive</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field>
          <mat-label>Scope</mat-label>
          <mat-select formControlName="scope" required>
            <mat-option value="Global">Global</mat-option>
            <mat-option value="Page">Page</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field>
          <mat-label>Expiration Date</mat-label>
          <input matInput type="datetime-local" formControlName="expirationDate" required />
        </mat-form-field>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button mat-dialog-close>Cancel</button>
        <button mat-flat-button color="primary" type="submit" [disabled]="!notificationForm.valid">Create</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: [
    `
      mat-dialog-content {
        display: flex;
        flex-direction: column;
        gap: 16px;
        min-width: 400px;
      }
    `
  ],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule
  ]
})
export class SaNotificationsDialogComponent {
  notificationForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<SaNotificationsDialogComponent>
  ) {
    this.notificationForm = this.fb.group({
      title: ['', Validators.required],
      content: ['', Validators.required],
      type: ['Unobtrusive', Validators.required],
      scope: ['Global', Validators.required],
      expirationDate: ['', Validators.required]
    });
  }

  submit(): void {
    if (this.notificationForm.valid) {
      const notification: Notification = {
        ...this.notificationForm.value,
        expirationDate: new Date(this.notificationForm.value.expirationDate).toISOString(),
        creationDate: new Date().toISOString()
      };
      this.dialogRef.close(notification);
    }
  }
}
