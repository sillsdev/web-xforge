import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { OwnerComponent } from 'xforge-common/owner/owner.component';

/**
 * A dropdown component for selecting an assignee on an onboarding request.
 * Always shows the current user first. Used in the onboarding requests list and detail views.
 */
@Component({
  selector: 'app-onboarding-request-assignee-select',
  templateUrl: './onboarding-request-assignee-select.component.html',
  styleUrls: ['./onboarding-request-assignee-select.component.scss'],
  imports: [FormsModule, MatFormFieldModule, MatSelectModule, OwnerComponent]
})
export class OnboardingRequestAssigneeSelectComponent implements OnChanges {
  /** The ID of the currently selected assignee. An empty string means unassigned. */
  @Input() value: string = '';
  /** IDs of users who are already known assignees and should appear in the dropdown. */
  @Input() knownAssigneeIds: string[] = [];
  /** The current user's ID. Always shown first in the dropdown. */
  @Input() currentUserId?: string;
  /** Emitted when the user selects a new assignee. */
  @Output() selectionChange = new EventEmitter<string>();

  /** Internal value used for optimistic UI updates while the parent's API call is in flight. */
  protected internalValue: string = '';

  ngOnChanges(): void {
    this.internalValue = this.value;
  }

  protected onSelectionChange(newValue: string): void {
    this.internalValue = newValue;
    this.selectionChange.emit(newValue);
  }

  /**
   * Returns the ordered list of user IDs to show in the dropdown.
   * The current user is shown first, followed by any other known assignees.
   */
  getOptions(): string[] {
    const options: string[] = [];
    if (this.currentUserId != null) {
      options.push(this.currentUserId);
    }
    for (const id of this.knownAssigneeIds) {
      if (id !== this.currentUserId && !options.includes(id)) {
        options.push(id);
      }
    }
    return options;
  }
}
