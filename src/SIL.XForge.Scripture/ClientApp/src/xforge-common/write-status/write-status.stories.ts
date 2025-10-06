import { Component, Input } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { ElementState } from '../models/element-state';
import { WriteStatusComponent } from './write-status.component';

@Component({
  selector: 'app-write-status-test',
  template: `<form [formGroup]="formGroup">
    <app-write-status [state]="state" [formGroup]="formGroup"></app-write-status>
  </form>`,
  standalone: false
})
class WriteStatusTestComponent {
  @Input() state?: ElementState;
  formGroup?: FormGroup = new FormGroup({});
}

const meta: Meta<WriteStatusComponent> = {
  title: 'Utility/Write Status',
  component: WriteStatusTestComponent,
  decorators: [
    moduleMetadata({
      declarations: [WriteStatusTestComponent],
      imports: [WriteStatusComponent]
    })
  ]
};
export default meta;

type Story = StoryObj<WriteStatusTestComponent>;

export const Submitting: Story = {
  args: { state: ElementState.Submitting }
};

export const Submitted: Story = {
  args: { state: ElementState.Submitted }
};

export const Error: Story = {
  args: { state: ElementState.Error }
};
